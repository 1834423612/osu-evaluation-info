import "server-only";
import { getDatabasePool } from "@/lib/db";
import {
  RMP_LIBRARY_PAGE_SIZE,
  rmpProfessorId,
  rmpSearchTokens,
  type RmpLibraryInput,
} from "./library-input";
import {
  LIBRARY_SEARCH_SQL,
  LIBRARY_PROFILE_FIELDS,
  LIBRARY_PROFILE_JOINS,
  LIBRARY_COURSES_SQL,
  LIBRARY_REVIEWS_SQL,
} from "./library-queries";
import type {
  RmpProfile,
  RmpLibraryResult,
  RmpProfileDetail,
} from "./library-types";
export async function searchRmpLibrary(
  input: RmpLibraryInput,
): Promise<RmpLibraryResult> {
  const result = await getDatabasePool().query<RmpProfile & { total: number }>(
    LIBRARY_SEARCH_SQL,
    [
      input.campus,
      input.identity,
      rmpSearchTokens(input.query),
      RMP_LIBRARY_PAGE_SIZE,
      input.offset,
    ],
  );
  const total = result.rows[0]?.total ?? 0;
  return {
    profiles: result.rows,
    total,
    nextOffset:
      input.offset + result.rows.length < total
        ? input.offset + result.rows.length
        : null,
  };
}
export async function getRmpProfileDetail(
  id: string,
  course: string | null,
  offset: number,
): Promise<RmpProfileDetail | null> {
  rmpProfessorId(id);
  if (
    (course?.length ?? 0) > 100 ||
    /[\x00-\x1f]/.test(course ?? "") ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new RangeError("Invalid RMP review filters.");
  const connection = await getDatabasePool().connect();
  try {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const profile = (
      await connection.query<RmpProfile>(
        `SELECT ${LIBRARY_PROFILE_FIELDS} ${LIBRARY_PROFILE_JOINS} WHERE p.legacy_id=$1::bigint`,
        [id],
      )
    ).rows[0];
    if (!profile) {
      await connection.query("COMMIT");
      return null;
    }
    const courses = await connection.query<RmpProfileDetail["courses"][number]>(
      LIBRARY_COURSES_SQL,
      [id],
    );
    const page = (
      await connection.query<Pick<RmpProfileDetail, "reviews" | "total">>(
        LIBRARY_REVIEWS_SQL,
        [id, course, 12, offset],
      )
    ).rows[0];
    await connection.query("COMMIT");
    return {
      profile,
      courses: courses.rows,
      ...page,
      nextOffset:
        offset + page.reviews.length < page.total
          ? offset + page.reviews.length
          : null,
    };
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

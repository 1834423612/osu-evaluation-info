import { getDatabasePool } from "../db.ts";
import {
  adminRowsSQL,
  adminListSQL,
  adminRowFields,
  adminSourceFingerprint,
} from "./admin-queries.ts";
import { rmpRecordFingerprint } from "./admin-fingerprint.ts";
import { rmpAdminTable } from "./admin-namespace.ts";
import { writeCourseDecision, RmpDecisionError } from "./admin-store.ts";
import type { AdminFilters, CourseDecisionInput } from "./admin-input.ts";
import type { RmpAdminRow, RmpAdminDetail } from "./admin-types.ts";
import {
  loadOfficialCourseReferences,
  lookupOfficialCourseMetadata,
  type OfficialCourseReference,
  findExactOfficialCourseReferences,
  filterOfficialCourseReferences,
} from "./official-courses.ts";
let referenceCache: {
  expires: number;
  rows: OfficialCourseReference[];
} | null = null;
let referencePending: Promise<OfficialCourseReference[]> | null = null;
async function officialReferences() {
  if (!referenceCache || referenceCache.expires <= Date.now()) {
    if (!referencePending)
      referencePending = loadOfficialCourseReferences((sql, values) =>
        getDatabasePool().query(sql, values),
      )
        .then((rows) => {
          referenceCache = { expires: Date.now() + 60000, rows };
          return rows;
        })
        .finally(() => {
          referencePending = null;
        });
    await referencePending;
  }
  return referenceCache!.rows;
}
const escaped = (value: string) => value.replace(/[\\%_]/g, "\\$&");
export async function listRmpAdmin(input: AdminFilters) {
  const titleKeys = input.course
    ? [
        ...new Set(
          (await officialReferences())
            .filter((row) =>
              row.title.toLowerCase().includes(input.course.toLowerCase()),
            )
            .map((row) => row.key),
        ),
      ]
    : [];
  const result = await getDatabasePool().query<{
    total: number;
    items: RmpAdminRow[];
  }>(adminListSQL(), [
    escaped(input.course),
    escaped(input.professor),
    input.status,
    input.campus,
    escaped(input.keyword),
    30,
    (input.page - 1) * 30,
    titleKeys,
  ]);
  return {
    ...result.rows[0],
    items: result.rows[0].items.map((row) => ({
      ...row,
      recordFingerprint: rmpRecordFingerprint(row),
    })),
    page: input.page,
    pageSize: 30,
  };
}
export async function rmpAdminDetail(
  professorId: string,
  campus: string,
  token: string,
): Promise<RmpAdminDetail | null> {
  const db = getDatabasePool();
  const item = await db.query<RmpAdminRow>(
    `${adminRowsSQL()} SELECT ${adminRowFields},(SELECT count(*)::int FROM osu_rmp.review rv WHERE rv.professor_id=rows.professor_id AND rv.active AND osu_rmp.review_course_token(rv.class_name)=rows.raw_course_token) AS "reviewCount",${adminSourceFingerprint("rows")} AS "sourceFingerprint" FROM rows WHERE professor_id=$1::bigint AND campus_code=$2 AND raw_course_token=$3`,
    [professorId, campus, token],
  );
  const row = item.rows[0];
  if (!row) return null;
  row.recordFingerprint = rmpRecordFingerprint(row);
  const [teaching, reviews, history] = await Promise.all([
    db.query<RmpAdminDetail["teaching"][number]>(
      `SELECT source,source_record_key,course_key,latest_term,campus_code FROM osu_rmp.instructor_course WHERE name_dot_number=$1 AND active ORDER BY campus_code,course_key,latest_term DESC LIMIT 300`,
      [row.username],
    ),
    db.query<RmpAdminDetail["reviews"][number]>(
      `SELECT legacy_id::text id,class_name course,coalesce(comment,'') comment,date_text date FROM osu_rmp.review WHERE professor_id=$1::bigint AND active AND osu_rmp.review_course_token(class_name)=$2 ORDER BY legacy_id DESC LIMIT 5`,
      [professorId, token],
    ),
    db.query<RmpAdminDetail["history"][number]>(
      `SELECT id::text,previous_decision,decision,recorded_at::text FROM ${rmpAdminTable("course_decision_audit")} WHERE professor_id=$1::bigint AND campus_code=$2 AND raw_course_token=$3 ORDER BY id DESC LIMIT 30`,
      [professorId, campus, token],
    ),
  ]);
  return {
    row,
    teaching: teaching.rows,
    reviews: reviews.rows,
    history: history.rows,
  };
}
export async function searchOfficialCourses(
  search: string,
  campus: string = "ALL",
) {
  const exact = await findExactOfficialCourseReferences(
    (sql, values) => getDatabasePool().query(sql, values),
    search,
    campus,
  );
  if (exact !== null) return exact;
  return filterOfficialCourseReferences(
    await officialReferences(),
    search,
    campus,
  );
}
export async function decideRmpCourse(
  input: CourseDecisionInput,
  actor: string,
) {
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    // Share the rebuild's advisory lock so its derived evidence cannot change
    // between validation and the audited decision. Source tables remain intact.
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SELECT pg_advisory_xact_lock(7241102917::bigint)");
    const exists = await db.query(
      `SELECT 1 FROM osu_rmp.course_identity_match WHERE professor_id=$1::bigint AND campus_code=$2 AND raw_course_token=$3`,
      [input.professorId, input.campus, input.token],
    );
    if (!exists.rows.length) throw new RmpDecisionError("unknown_label");
    if (input.action === "bind") {
      const official = await lookupOfficialCourseMetadata(
        (sql, values) => db.query(sql, values),
        [{ campus: input.campus, key: input.courseKey! }],
      );
      if (!official.length)
        throw new RmpDecisionError("unknown_official_course");
    }
    const result = await writeCourseDecision(
      (sql, values) => db.query(sql, values),
      input,
      actor,
    );
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

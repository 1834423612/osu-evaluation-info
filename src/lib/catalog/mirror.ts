import "server-only";
import {
  FIND_CATALOG_SNAPSHOT_SQL,
  LATEST_CATALOG_TERM_SQL,
  LIST_CATALOG_TERMS_SQL,
  FIND_COURSE_ARCHIVE_SQL,
} from "./snapshot-policy";
import type { PoolClient } from "pg";
import { getDatabasePool, isDatabaseConfigured } from "@/lib/db";
import {
  CatalogInputError,
  mergeCatalogCourse,
  normalizeOfficialCourse,
} from "./official-client";
import type {
  CatalogCourse,
  CatalogFacet,
  CatalogResponse,
  CatalogSearch,
  CatalogTerm,
} from "./types";

type MirrorCursor = {
  run: string;
  term: string;
  campus: string;
  subject: string;
  sort: string;
  keys: [string, string, string];
};
type Group = {
  subject: string;
  catalog_number: string;
  campus_code: string;
  k1: string;
  k2: string;
  k3: string;
};
type Snapshot = { id: string; completed_at: Date | string; terms: string[] };
const CATALOG_SOURCE = "https://classes.osu.edu/";
const SORTS = new Set([
  "subject",
  "-subject",
  "catalogNumber",
  "-catalogNumber",
]);

export function canUseCatalogMirror(input: CatalogSearch) {
  return !input.q?.trim() && !Object.values(input.filters ?? {}).some(Boolean);
}

type CatalogConnection = PoolClient;

async function latestEligibleTerm(connection: CatalogConnection) {
  const result = await connection.query<{ term_code: string }>(
    LATEST_CATALOG_TERM_SQL,
  );
  return result.rows[0]?.term_code ?? null;
}

async function findSnapshot(
  connection: CatalogConnection,
  term: string,
  run?: string,
) {
  const result = await connection.query<Snapshot>(FIND_CATALOG_SNAPSHOT_SQL, [
    term,
    run ?? null,
  ]);
  return result.rows[0] ?? null;
}

function decodeCursor(value: string): MirrorCursor {
  try {
    if (value.length > 2048 || !value.startsWith("m:")) throw new Error();
    const cursor = JSON.parse(
      Buffer.from(value.slice(2), "base64url").toString("utf8"),
    ) as MirrorCursor;
    if (
      !/^[0-9a-f-]{36}$/.test(cursor.run) ||
      !/^\d{4}$/.test(cursor.term) ||
      ![cursor.campus, cursor.subject, cursor.sort].every(
        (v) => typeof v === "string" && v.length <= 32,
      ) ||
      !Array.isArray(cursor.keys) ||
      cursor.keys.length !== 3 ||
      !cursor.keys.every((v) => typeof v === "string" && v.length <= 100)
    )
      throw new Error();
    return cursor;
  } catch {
    throw new CatalogInputError("Invalid catalog snapshot cursor.");
  }
}

/** Complete snapshots supply broad browsing only when the official service is unavailable. */
export async function searchCatalogMirror(
  input: CatalogSearch,
  official: CatalogResponse | null,
): Promise<CatalogResponse | null> {
  if (!canUseCatalogMirror(input) || !isDatabaseConfigured()) return null;
  const campus =
    input.campus === "all" ? "" : (input.campus ?? "col").toUpperCase();
  const subject = input.subject?.toUpperCase() ?? "";
  const sort = SORTS.has(input.sort ?? "subject")
    ? (input.sort ?? "subject")
    : "subject";
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const connection = await getDatabasePool()
    .connect()
    .catch(() => null);
  if (!connection) return null;
  try {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const term =
      input.term ||
      official?.terms[0]?.code ||
      cursor?.term ||
      (await latestEligibleTerm(connection));
    if (!term) {
      await connection.query("COMMIT");
      return null;
    }
    const snapshot = await findSnapshot(connection, term, cursor?.run);
    if (!snapshot) {
      await connection.query("COMMIT");
      return null;
    }
    if (
      cursor &&
      [
        cursor.term !== term,
        cursor.campus !== campus,
        cursor.subject !== subject,
        cursor.sort !== sort,
      ].some(Boolean)
    )
      throw new CatalogInputError(
        "Catalog snapshot cursor does not match the current filters.",
      );
    if (cursor && cursor.run !== snapshot.id)
      throw new CatalogInputError(
        "The catalog snapshot changed. Start the search again.",
      );
    const limit = Math.min(24, Math.max(1, input.limit ?? 12));
    const descending = sort.startsWith("-");
    const direction = descending ? "DESC" : "ASC";
    const comparison = descending ? "<" : ">";
    const byNumber = sort.includes("catalogNumber");
    // Values remain SQL parameters. Only these fixed, allowlisted sort fragments interpolate.
    const k1 = byNumber ? "number_key" : "subject";
    const k2 = byNumber ? "subject" : "number_key";
    const page = (
      await connection.query<{
        total_courses: number;
        total_sections: number;
        groups: Group[];
      }>(
        `
      WITH grouped AS (
        SELECT subject,catalog_number,campus_code,count(*)::int AS section_count,
          COALESCE(lpad(substring(catalog_number from '^[0-9]+'),8,'0') || regexp_replace(catalog_number,'^[0-9]+',''),catalog_number) AS number_key
        FROM osu_catalog.section_snapshots
        WHERE last_seen_run=$1::uuid AND term_code=$2 AND ($3='' OR campus_code=$3) AND ($4='' OR subject=$4)
        GROUP BY subject,catalog_number,campus_code
      ), ordered AS (
        SELECT *,${k1} COLLATE "C" AS k1,${k2} COLLATE "C" AS k2,campus_code COLLATE "C" AS k3 FROM grouped
      ), selected AS (
        SELECT subject,catalog_number,campus_code,k1,k2,k3 FROM ordered
        WHERE $5::text IS NULL OR (k1,k2,k3) ${comparison} ($5 COLLATE "C",$6 COLLATE "C",$7 COLLATE "C")
        ORDER BY k1 ${direction},k2 ${direction},k3 ${direction} LIMIT $8
      )
      SELECT (SELECT count(*)::int FROM grouped) AS total_courses,
        (SELECT COALESCE(sum(section_count),0)::int FROM grouped) AS total_sections,
        COALESCE((SELECT json_agg(selected ORDER BY selected.k1 ${direction},selected.k2 ${direction},selected.k3 ${direction}) FROM selected),'[]'::json) AS groups`,
        [
          snapshot.id,
          term,
          campus,
          subject,
          cursor?.keys[0] ?? null,
          cursor?.keys[1] ?? null,
          cursor?.keys[2] ?? null,
          limit + 1,
        ],
      )
    ).rows[0];
    const hasMore = page.groups.length > limit;
    const groups = page.groups.slice(0, limit);
    const courses: CatalogCourse[] = [];
    if (groups.length) {
      const details = await connection.query<{
        subject: string;
        catalog_number: string;
        campus_code: string;
        course_data: Record<string, unknown>[];
        section_data: Record<string, unknown>[];
      }>(
        `
        WITH requested AS (SELECT * FROM unnest($3::text[],$4::text[],$5::text[]) AS r(subject,catalog_number,campus_code))
        SELECT r.*,
          COALESCE((SELECT json_agg(c.data ORDER BY c.course_id,c.offering_number)
            FROM osu_catalog.course_snapshots c WHERE c.last_seen_run=$1::uuid AND c.term_code=$2
              AND c.subject=r.subject AND c.catalog_number=r.catalog_number
              AND (c.campus_code=r.campus_code OR NOT EXISTS(SELECT 1 FROM osu_catalog.course_snapshots exact
                WHERE exact.last_seen_run=$1::uuid AND exact.term_code=$2 AND exact.subject=r.subject
                  AND exact.catalog_number=r.catalog_number AND exact.campus_code=r.campus_code))),'[]'::json) AS course_data,
          COALESCE((SELECT json_agg(s.data ORDER BY s.class_number)
            FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=$1::uuid AND s.term_code=$2
              AND s.subject=r.subject AND s.catalog_number=r.catalog_number AND s.campus_code=r.campus_code),'[]'::json) AS section_data
        FROM requested r`,
        [
          snapshot.id,
          term,
          groups.map((g) => g.subject),
          groups.map((g) => g.catalog_number),
          groups.map((g) => g.campus_code),
        ],
      );
      const normalized = new Map<string, CatalogCourse>();
      for (const row of details.rows) {
        let course: CatalogCourse | null = null;
        for (const data of row.course_data) {
          const next = normalizeOfficialCourse(
            {
              course: {
                ...data,
                campusCode: row.campus_code,
                campus: row.section_data[0]?.campus ?? data.campus,
              },
              sections: row.section_data,
            },
            term,
          );
          course = course ? mergeCatalogCourse(course, next) : next;
        }
        if (!course)
          throw new Error("Snapshot has sections without course metadata.");
        course.sectionsPartial = false;
        normalized.set(
          `${row.subject}\0${row.catalog_number}\0${row.campus_code}`,
          course,
        );
      }
      for (const group of groups)
        courses.push(
          normalized.get(
            `${group.subject}\0${group.catalog_number}\0${group.campus_code}`,
          )!,
        );
    }
    const last = groups.at(-1);
    const nextCursor =
      hasMore && last
        ? `m:${Buffer.from(JSON.stringify({ run: snapshot.id, term, campus, subject, sort, keys: [last.k1, last.k2, last.k3] } satisfies MirrorCursor)).toString("base64url")}`
        : null;
    const snapshotAt = new Date(snapshot.completed_at).toISOString();
    const terms: CatalogTerm[] = [
      ...new Map(
        [
          ...(await connection.query<CatalogTerm>(LIST_CATALOG_TERMS_SQL)).rows,
          ...(official?.terms ?? []),
        ].map((term) => [term.code, term]),
      ).values(),
    ].sort((a, b) => b.code.localeCompare(a.code));
    const filters: CatalogFacet[] =
      official?.filters ??
      (await getMirrorFacets(connection, snapshot.id, term, campus, subject));
    await connection.query("COMMIT");
    return {
      courses,
      page: input.page ?? 1,
      nextCursor,
      hasMore,
      totalItems: page.total_sections,
      matchedSections: page.total_sections,
      totalCourses: page.total_courses,
      totalPages: Math.ceil(page.total_courses / limit),
      capped: false,
      filters,
      terms,
      source: official?.source ?? CATALOG_SOURCE,
      sourceMode: "mirror",
      snapshotAt,
      fetchedAt: official?.fetchedAt ?? snapshotAt,
      evaluationStatus: official?.evaluationStatus ?? "unavailable",
    };
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    if (error instanceof CatalogInputError) throw error;
    return null;
  } finally {
    connection.release();
  }
}

async function getMirrorFacets(
  connection: CatalogConnection,
  run: string,
  term: string,
  campus: string,
  subject: string,
): Promise<CatalogFacet[]> {
  const [subjects, campuses] = await Promise.all([
    connection.query<{ value: string; count: number }>(
      `
      SELECT subject AS value,count(*)::int AS count FROM osu_catalog.section_snapshots
      WHERE last_seen_run=$1::uuid AND term_code=$2 GROUP BY subject ORDER BY subject`,
      [run, term],
    ),
    connection.query<{ value: string; label: string | null; count: number }>(
      `
      SELECT campus_code AS value,MAX(NULLIF(data->>'campus','')) AS label,count(*)::int AS count
      FROM osu_catalog.section_snapshots WHERE last_seen_run=$1::uuid AND term_code=$2
      GROUP BY campus_code ORDER BY campus_code`,
      [run, term],
    ),
  ]);
  const selectedCampus = campus || "COL";
  return [
    {
      slug: "subject",
      title: "Subject",
      items: subjects.rows.map((item) => ({
        ...item,
        label: item.value,
        selected: item.value === subject,
      })),
    },
    {
      slug: "campus",
      title: "Campus",
      items: campuses.rows.map((item) => ({
        value: item.value.toLowerCase(),
        label: item.label || item.value,
        count: item.count,
        selected: item.value === selectedCampus,
      })),
    },
  ];
}

/** Full course details from the complete catalog snapshot when OSU is unavailable. */
export async function getCatalogCourseMirror(input: {
  subject: string;
  catalog: string;
  term?: string;
  campus?: string;
  includeArchived?: boolean;
}) {
  if (!isDatabaseConfigured()) return null;
  const connection = await getDatabasePool()
    .connect()
    .catch(() => null);
  if (!connection) return null;
  try {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const term = input.term || (await latestEligibleTerm(connection));
    if (!term) {
      await connection.query("COMMIT");
      return null;
    }
    const head = await findSnapshot(connection, term);
    const campus = (input.campus ?? "col").toUpperCase();
    const snapshot = input.includeArchived
      ? ((
          await connection.query<Snapshot>(FIND_COURSE_ARCHIVE_SQL, [
            term,
            input.subject.toUpperCase(),
            input.catalog.toUpperCase(),
            campus,
          ])
        ).rows[0] ?? head)
      : head;
    if (!snapshot) {
      await connection.query("COMMIT");
      return null;
    }
    const rows = await connection.query<{
      campus_code: string;
      course_data: Record<string, unknown>[];
      section_data: Record<string, unknown>[];
    }>(
      `
      SELECT selected.campus_code,
        COALESCE((SELECT json_agg(c.data ORDER BY c.course_id,c.offering_number)
          FROM osu_catalog.course_snapshots c WHERE c.last_seen_run=$1::uuid AND c.term_code=$2
            AND c.subject=$3 AND c.catalog_number=$4
            AND (c.campus_code=selected.campus_code OR NOT EXISTS(
              SELECT 1 FROM osu_catalog.course_snapshots exact WHERE exact.last_seen_run=$1::uuid
                AND exact.term_code=$2 AND exact.subject=$3 AND exact.catalog_number=$4
                AND exact.campus_code=selected.campus_code))),'[]'::json) AS course_data,
        COALESCE((SELECT json_agg(s.data ORDER BY s.class_number)
          FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=$1::uuid AND s.term_code=$2
            AND s.subject=$3 AND s.catalog_number=$4 AND s.campus_code=selected.campus_code),'[]'::json) AS section_data
      FROM (SELECT DISTINCT campus_code FROM osu_catalog.section_snapshots
        WHERE last_seen_run=$1::uuid AND term_code=$2 AND subject=$3 AND catalog_number=$4
          AND ($5='ALL' OR campus_code=$5)) selected`,
      [
        snapshot.id,
        term,
        input.subject.toUpperCase(),
        input.catalog.toUpperCase(),
        campus,
      ],
    );
    let course: CatalogCourse | null = null;
    for (const row of rows.rows) {
      for (const data of row.course_data) {
        const next = normalizeOfficialCourse(
          {
            course: {
              ...data,
              campusCode: row.campus_code,
              campus: row.section_data[0]?.campus ?? data.campus,
            },
            sections: row.section_data,
          },
          term,
        );
        course = course ? mergeCatalogCourse(course, next) : next;
      }
    }
    if (course) {
      const sections = new Map<string, CatalogCourse["sections"][number]>();
      for (const row of rows.rows) {
        const related = row.course_data.length ? row.section_data : [];
        const normalized = normalizeOfficialCourse(
          {
            course: row.course_data[0] ?? {},
            sections: related,
          },
          term,
        );
        for (const section of normalized.sections)
          sections.set(section.id, section);
      }
      course.sections = [...sections.values()].sort((a, b) =>
        a.classNumber.localeCompare(b.classNumber, undefined, {
          numeric: true,
        }),
      );
      course.sectionsPartial = false;
    }
    const snapshotAt = new Date(snapshot.completed_at).toISOString();
    const sourceState = (
      await connection.query<{ source_status: string }>(
        "SELECT source_status FROM osu_catalog.term_archives WHERE term_code=$1",
        [term],
      )
    ).rows[0]?.source_status;
    if (course && (snapshot.id !== head?.id || sourceState === "not-listed"))
      course.archive = {
        reason:
          snapshot.id !== head?.id
            ? "not-in-latest-snapshot"
            : "term-not-listed",
        snapshotAt,
      };
    await connection.query("COMMIT");
    return {
      course,
      fetchedAt: snapshotAt,
      snapshotAt,
      sourceMode: "mirror" as const,
      complete: true,
      source: CATALOG_SOURCE,
    };
  } catch {
    await connection.query("ROLLBACK").catch(() => {});
    return null;
  } finally {
    connection.release();
  }
}

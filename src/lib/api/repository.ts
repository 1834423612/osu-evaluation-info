import type { QueryResultRow } from "pg";

import { isDatabaseConfigured, queryDatabase } from "@/lib/db";
import { previewEvaluations } from "@/lib/api/preview-data";
import type {
  ApiDataStatus,
  ComparisonItem,
  ComparisonResponse,
  ComparisonTarget,
  CourseDetail,
  CourseSummary,
  EvaluationRecord,
  FacetValue,
  FacetsResponse,
  Instrument,
  InstrumentMetrics,
  InstructorDetail,
  InstructorSummary,
  Repository,
  SearchFilters,
  SearchPageInfo,
  SearchRequest,
  SearchResponse,
  SearchSort,
} from "@/lib/api/types";

const seasonOrder: Record<string, number> = { SP: 1, SU: 2, AU: 3 };

const RATING_NOTICE =
  "SEI (through SU 2025) uses the overall-rating item; SSLE (from AU 2025) is the mean of SSLE items. They are shown separately, and small score differences are not meaningful.";

const PREVIEW_STATUS: ApiDataStatus = {
  mode: "preview",
  label: "Official-source preview (12 rows)",
  coverage: "12 verified official rows, AU 2022 - SP 2026",
  isPreview: true,
  ratingNotice: RATING_NOTICE,
};

const DATABASE_STATUS: ApiDataStatus = {
  mode: "database",
  label: "Official OSU evaluation snapshot",
  coverage: "68,729 official evaluations, SU 2022 - SU 2026",
  isPreview: false,
  ratingNotice: RATING_NOTICE,
};

interface PreviewRow extends EvaluationRecord {
  evaluationId: string;
  firstName: string;
  lastName: string;
  subject: string;
  catalog: string | null;
  termSortKey: number;
}

interface DbEvaluationRow extends QueryResultRow {
  evaluation_id: string | number;
  instructor_id: string | number;
  name_dot_number: string;
  current_first_name: string;
  current_last_name: string;
  term: string;
  term_sort_key: string | number;
  class_number: string;
  subject: string;
  catalog: string | null;
  catalog_raw: string;
  course_key?: string;
  class_title: string;
  college: string;
  department: string;
  delivery_mode: string;
  campus_code: string;
  class_size_category: string;
  instrument: Instrument;
  metric_kind: InstrumentMetrics["metricKind"];
  n_responses: string | number;
  rating: string | number;
  standard_deviation: string | number | null;
  invited_count: string | number;
  response_ratio: string | number;
}

interface DbInstructorSummaryRow extends QueryResultRow {
  instructor_id: string | number;
  name_dot_number: string;
  current_first_name: string;
  current_last_name: string;
  departments?: string[] | null;
  instrument: Instrument;
  evaluation_count: string | number;
  section_count: string | number;
  course_count: string | number;
  total_course_count?: string | number;
  metric_course_count?: string | number;
  total_responses: string | number;
  total_invited: string | number;
  mean_section_rating: string | number;
  response_weighted_rating: string | number;
  pooled_response_rate: string | number;
  first_term_sort_key: string | number;
  last_term_sort_key: string | number;
  total_count?: string | number;
}

interface DbCourseSummaryRow extends QueryResultRow {
  course_id: string | number;
  course_key: string;
  subject: string;
  catalog: string | null;
  catalog_raw: string;
  class_title: string;
  colleges: string[] | null;
  departments: string[] | null;
  instructor_count: string | number;
  instrument: Instrument;
  evaluation_count: string | number;
  section_count: string | number;
  metric_section_count?: string | number;
  total_responses: string | number;
  total_invited: string | number;
  mean_section_rating: string | number;
  response_weighted_rating: string | number;
  pooled_response_rate: string | number;
  first_term_sort_key: string | number;
  last_term_sort_key: string | number;
  total_count?: string | number;
}

interface DbInstructorRow extends QueryResultRow {
  instructor_id: string | number;
  name_dot_number: string;
  current_first_name: string;
  current_last_name: string;
}

interface DbCourseRow extends QueryResultRow {
  course_id: string | number;
  course_key: string;
  subject: string;
  catalog: string | null;
  catalog_raw: string;
  class_title: string;
  colleges: string[] | null;
  departments: string[] | null;
  instructor_count: string | number;
  section_count: string | number;
}

interface DbFacetRow extends QueryResultRow {
  facet?:
    | "term"
    | "subject"
    | "college"
    | "campus"
    | "department"
    | "deliveryMode"
    | "classSizeCategory";
  value: string;
  count: string | number;
}

interface DbCountRow extends QueryResultRow {
  total: string | number;
}

const SEARCH_BASE_CTE = `
  WITH base AS (
    SELECT
      e.id AS evaluation_id,
      e.section_id,
      e.instructor_id,
      e.instrument,
      e.n_responses,
      e.invited_count,
      e.rating,
      sec.course_id,
      sec.class_title,
      sec.college,
      sec.department,
      sec.delivery_mode,
      sec.class_size_category,
      sec.campus_code AS campus,
      t.sort_key AS term_sort_key,
      t.label AS term,
      c.course_key,
      c.catalog,
      c.catalog_raw,
      subj.code AS subject,
      i.name_dot_number,
      i.current_first_name,
      i.current_last_name
    FROM osu_eval.evaluation e
    JOIN osu_eval.section sec ON sec.id = e.section_id
    JOIN osu_eval.term t ON t.id = sec.term_id
    JOIN osu_eval.course c ON c.id = sec.course_id
    JOIN osu_eval.subject subj ON subj.id = c.subject_id
    JOIN osu_eval.instructor i ON i.id = e.instructor_id
    WHERE ($1::text IS NULL OR e.instrument = $1)
      AND ($2::text IS NULL OR subj.code = $2)
      AND ($3::text IS NULL OR sec.college = $3)
      AND ($4::text IS NULL OR sec.campus_code = $4)
      AND ($5::text IS NULL OR sec.department = $5)
      AND ($6::text IS NULL OR sec.delivery_mode = $6)
      AND ($7::text IS NULL OR sec.class_size_category = $7)
      AND ($8::text IS NULL OR t.label = $8)
      AND (
        $9::text IS NULL
        OR lower(i.current_first_name || ' ' || i.current_last_name) LIKE '%' || $9 || '%'
        OR lower(i.name_dot_number) LIKE '%' || $9 || '%'
        OR lower(subj.code || ' ' || coalesce(c.catalog, c.catalog_raw)) LIKE '%' || $9 || '%'
        OR lower(sec.class_title) LIKE '%' || $9 || '%'
      )
      AND EXISTS (
        SELECT 1
        FROM osu_eval.evaluation_source_state ess
        WHERE ess.evaluation_id = e.id AND ess.active
      )
  )
`;

const INSTRUCTOR_SORT_SQL: Record<SearchSort, string> = {
  default:
    "candidate.current_last_name ASC, candidate.current_first_name ASC, candidate.name_dot_number ASC",
  rating_desc:
    "candidate.sort_mean_rating DESC NULLS LAST, candidate.sort_total_responses DESC, candidate.current_last_name ASC, candidate.current_first_name ASC, candidate.name_dot_number ASC",
  responses_desc:
    "candidate.sort_total_responses DESC, candidate.current_last_name ASC, candidate.current_first_name ASC, candidate.name_dot_number ASC",
  sections_desc:
    "candidate.sort_section_count DESC, candidate.current_last_name ASC, candidate.current_first_name ASC, candidate.name_dot_number ASC",
  recent_desc:
    "candidate.last_term_sort_key DESC, candidate.current_last_name ASC, candidate.current_first_name ASC, candidate.name_dot_number ASC",
};

const COURSE_SORT_SQL: Record<SearchSort, string> = {
  default:
    "candidate.subject ASC, candidate.catalog NULLS LAST, candidate.course_key ASC",
  rating_desc:
    "candidate.sort_mean_rating DESC NULLS LAST, candidate.sort_total_responses DESC, candidate.subject ASC, candidate.catalog NULLS LAST, candidate.course_key ASC",
  responses_desc:
    "candidate.sort_total_responses DESC, candidate.subject ASC, candidate.catalog NULLS LAST, candidate.course_key ASC",
  sections_desc:
    "candidate.sort_section_count DESC, candidate.subject ASC, candidate.catalog NULLS LAST, candidate.course_key ASC",
  recent_desc:
    "candidate.last_term_sort_key DESC, candidate.subject ASC, candidate.catalog NULLS LAST, candidate.course_key ASC",
};

const DB_EVALUATION_DETAIL_SELECT = `
  SELECT
    e.id AS evaluation_id,
    t.label AS term,
    t.sort_key AS term_sort_key,
    sec.class_number,
    subj.code AS subject,
    c.catalog,
    c.catalog_raw,
    c.course_key,
    sec.class_title,
    sec.college,
    sec.department,
    sec.delivery_mode,
    sec.campus_code,
    sec.class_size_category,
    i.id AS instructor_id,
    i.name_dot_number,
    i.current_first_name,
    i.current_last_name,
    e.instrument,
    e.metric_kind,
    e.n_responses,
    e.rating,
    e.standard_deviation,
    e.invited_count,
    e.response_ratio
  FROM osu_eval.evaluation e
  JOIN osu_eval.section sec ON sec.id = e.section_id
  JOIN osu_eval.term t ON t.id = sec.term_id
  JOIN osu_eval.course c ON c.id = sec.course_id
  JOIN osu_eval.subject subj ON subj.id = c.subject_id
  JOIN osu_eval.instructor i ON i.id = e.instructor_id
`;

function numberValue(value: string | number | null | undefined, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asId(value: string | number) {
  return String(value);
}

function termSortKey(term: string) {
  const match = /^(SP|SU|AU) (\d{2})$/.exec(term.trim());
  if (!match) return 0;
  return (2000 + Number(match[2])) * 10 + (seasonOrder[match[1]] ?? 0);
}

function metricKindFor(
  instrument: Instrument,
): InstrumentMetrics["metricKind"] {
  return instrument === "SEI" ? "sei_overall_item_10" : "ssle_mean_all_items";
}

function metricFromValues(
  instrument: Instrument,
  rows: Array<{
    rating: number;
    responseCount: number;
    invitedCount: number;
    term: string;
    sectionId?: string;
    courseId?: string;
  }>,
): InstrumentMetrics {
  const evaluationCount = rows.length;
  const sectionIds = new Set(
    rows.map((row) => row.sectionId ?? `${row.term}:${row.courseId ?? ""}`),
  );
  const courseIds = new Set(rows.map((row) => row.courseId).filter(Boolean));
  const responseCount = rows.reduce((sum, row) => sum + row.responseCount, 0);
  const invitedCount = rows.reduce((sum, row) => sum + row.invitedCount, 0);
  const meanSectionRating = evaluationCount
    ? rows.reduce((sum, row) => sum + row.rating, 0) / evaluationCount
    : 0;
  const responseWeightedRating = responseCount
    ? rows.reduce((sum, row) => sum + row.rating * row.responseCount, 0) /
      responseCount
    : 0;
  const orderedTerms = rows
    .map((row) => row.term)
    .sort((a, b) => termSortKey(a) - termSortKey(b));
  return {
    instrument,
    metricKind: metricKindFor(instrument),
    evaluationCount,
    sectionCount: sectionIds.size,
    courseCount: courseIds.size,
    responseCount,
    invitedCount,
    responseRate: invitedCount
      ? rounded((responseCount / invitedCount) * 100)
      : 0,
    meanSectionRating: rounded(meanSectionRating, 4),
    responseWeightedRating: rounded(responseWeightedRating, 4),
    termCoverage: {
      first: orderedTerms[0] ?? "",
      last: orderedTerms.at(-1) ?? "",
    },
  };
}

function metricsByInstrument(
  rows: Array<{
    instrument: Instrument;
    rating: number;
    responseCount: number;
    invitedCount: number;
    term: string;
    sectionId?: string;
    courseId?: string;
  }>,
) {
  return (["SEI", "SSLE"] as const)
    .map((instrument) => {
      const instrumentRows = rows.filter(
        (row) => row.instrument === instrument,
      );
      return instrumentRows.length
        ? metricFromValues(instrument, instrumentRows)
        : null;
    })
    .filter((metric): metric is InstrumentMetrics => metric !== null);
}

function evaluationFromDb(row: DbEvaluationRow): EvaluationRecord {
  const instructorKey = row.name_dot_number;
  const courseCode = row.catalog
    ? `${row.subject} ${row.catalog}`
    : `${row.subject} (catalog unavailable)`;
  const courseKey =
    row.course_key ??
    (row.catalog
      ? `${row.subject}|${row.catalog}`
      : `${row.subject}|<UNKNOWN_CATALOG>|${row.class_title}`);
  return {
    evaluationId: asId(row.evaluation_id),
    instructorId: asId(row.instructor_id),
    instructorKey,
    instructorName: `${row.current_first_name} ${row.current_last_name}`,
    courseKey,
    courseCode,
    courseTitle: row.class_title,
    term: row.term,
    classNumber: row.class_number,
    instrument: row.instrument,
    metricKind: row.metric_kind,
    rating: numberValue(row.rating),
    standardDeviation:
      row.standard_deviation === null
        ? null
        : numberValue(row.standard_deviation),
    responseCount: numberValue(row.n_responses),
    invitedCount: numberValue(row.invited_count),
    responseRate: numberValue(row.response_ratio),
    classSizeCategory: row.class_size_category,
    campus: row.campus_code,
    college: row.college,
    department: row.department,
    deliveryMode: row.delivery_mode,
  };
}

function instructorSummaryFromDb(
  row: DbInstructorSummaryRow,
): InstructorSummary {
  return {
    id: asId(row.instructor_id),
    key: row.name_dot_number,
    name: `${row.current_first_name} ${row.current_last_name}`,
    firstName: row.current_first_name,
    lastName: row.current_last_name,
    coursesTaught: numberValue(row.total_course_count ?? row.course_count),
    departments: row.departments ?? [],
    metrics: [
      {
        instrument: row.instrument,
        metricKind: metricKindFor(row.instrument),
        evaluationCount: numberValue(row.evaluation_count),
        sectionCount: numberValue(row.section_count),
        courseCount: numberValue(row.metric_course_count ?? row.course_count),
        responseCount: numberValue(row.total_responses),
        invitedCount: numberValue(row.total_invited),
        responseRate: numberValue(row.pooled_response_rate),
        meanSectionRating: numberValue(row.mean_section_rating),
        responseWeightedRating: numberValue(row.response_weighted_rating),
        termCoverage: {
          first: termFromSortKey(numberValue(row.first_term_sort_key)),
          last: termFromSortKey(numberValue(row.last_term_sort_key)),
        },
      },
    ],
  };
}

function termFromSortKey(sortKey: number) {
  if (!sortKey) return "";
  const season =
    Object.entries(seasonOrder).find(
      ([, value]) => sortKey % 10 === value,
    )?.[0] ?? "";
  return `${season} ${String(Math.floor(sortKey / 10)).slice(-2)}`;
}

function mergeInstructorSummaries(rows: DbInstructorSummaryRow[]) {
  const byKey = new Map<string, InstructorSummary>();
  for (const row of rows) {
    const current = byKey.get(row.name_dot_number);
    const item = instructorSummaryFromDb(row);
    if (!current) {
      byKey.set(row.name_dot_number, item);
      continue;
    }
    current.metrics.push(...item.metrics);
    current.coursesTaught = Math.max(
      current.coursesTaught,
      item.coursesTaught,
      numberValue(row.total_course_count),
    );
    current.departments = [
      ...new Set([...current.departments, ...item.departments]),
    ].sort();
  }
  return [...byKey.values()];
}

function courseSummaryFromDb(row: DbCourseSummaryRow): CourseSummary {
  const code = row.catalog
    ? `${row.subject} ${row.catalog}`
    : `${row.subject} (catalog unavailable)`;
  return {
    id: asId(row.course_id),
    key: row.course_key,
    subject: row.subject,
    catalog: row.catalog,
    code,
    title: row.class_title,
    colleges: row.colleges ?? [],
    departments: row.departments ?? [],
    instructorCount: numberValue(row.instructor_count),
    sectionCount: numberValue(row.section_count),
    metrics: [
      {
        instrument: row.instrument,
        metricKind: metricKindFor(row.instrument),
        evaluationCount: numberValue(row.evaluation_count),
        sectionCount: numberValue(
          row.metric_section_count ?? row.section_count,
        ),
        responseCount: numberValue(row.total_responses),
        invitedCount: numberValue(row.total_invited),
        responseRate: numberValue(row.pooled_response_rate),
        meanSectionRating: numberValue(row.mean_section_rating),
        responseWeightedRating: numberValue(row.response_weighted_rating),
        termCoverage: {
          first: termFromSortKey(numberValue(row.first_term_sort_key)),
          last: termFromSortKey(numberValue(row.last_term_sort_key)),
        },
      },
    ],
  };
}

function mergeCourseSummaries(rows: DbCourseSummaryRow[]) {
  const byKey = new Map<string, CourseSummary>();
  for (const row of rows) {
    const current = byKey.get(`${row.course_id}`);
    const item = courseSummaryFromDb(row);
    if (!current) {
      byKey.set(`${row.course_id}`, item);
      continue;
    }
    current.metrics.push(...item.metrics);
    current.instructorCount = Math.max(
      current.instructorCount,
      item.instructorCount,
    );
    current.sectionCount = Math.max(current.sectionCount, item.sectionCount);
    current.colleges = [
      ...new Set([...current.colleges, ...item.colleges]),
    ].sort();
    current.departments = [
      ...new Set([...current.departments, ...item.departments]),
    ].sort();
  }
  return [...byKey.values()];
}

function facetValues(rows: DbFacetRow[]): FacetValue[] {
  return rows.map((row) => ({
    value: row.value,
    label: row.value,
    count: numberValue(row.count),
  }));
}

function searchFilterValues(filters: SearchFilters) {
  return [
    filters.instrument ?? null,
    filters.subject ?? null,
    filters.college ?? null,
    filters.campus ?? null,
    filters.department ?? null,
    filters.deliveryMode ?? null,
    filters.classSizeCategory ?? null,
    filters.term ?? null,
    filters.query?.trim().toLowerCase() || null,
  ] as const;
}

function pageInfo(total: number, page: number, limit: number): SearchPageInfo {
  const totalPages = total ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasPreviousPage: page > 1 && total > 0,
    hasNextPage: totalPages > page,
  };
}

async function countDatabaseSearchCandidates(
  kind: "instructor" | "course",
  filters: SearchFilters,
) {
  const identity = kind === "instructor" ? "instructor_id" : "course_id";
  const result = await queryDatabase<DbCountRow>(
    `${SEARCH_BASE_CTE}
     SELECT count(DISTINCT ${identity})::integer AS total
     FROM base`,
    searchFilterValues(filters),
  );
  return numberValue(result.rows[0]?.total);
}

/** Database-backed implementation. Every user-controlled value is a query parameter. */
class DatabaseRepository implements Repository {
  readonly dataStatus = DATABASE_STATUS;

  async search(request: SearchRequest): Promise<SearchResponse> {
    const filterValues = searchFilterValues(request);
    const offset = (request.page - 1) * request.limit;
    const instructorSort = INSTRUCTOR_SORT_SQL[request.sort];
    const courseSort = COURSE_SORT_SQL[request.sort];

    const [instructorResult, courseResult] = await Promise.all([
      request.kind === "courses"
        ? Promise.resolve({ rows: [] as DbInstructorSummaryRow[] })
        : queryDatabase<DbInstructorSummaryRow>(
            `
            ${SEARCH_BASE_CTE},
            candidate_stats AS (
              SELECT
                b.instructor_id,
                b.name_dot_number,
                b.current_first_name,
                b.current_last_name,
                count(DISTINCT b.course_id)::integer AS total_course_count,
                array_agg(DISTINCT b.department ORDER BY b.department) AS departments,
                count(DISTINCT b.section_id)::integer AS section_count,
                sum(b.n_responses)::bigint AS total_responses,
                round(avg(b.rating), 4) AS mean_section_rating,
                CASE
                  WHEN $1::text IS NULL THEN
                    coalesce(
                      avg(b.rating) FILTER (WHERE b.instrument = 'SEI'),
                      avg(b.rating) FILTER (WHERE b.instrument = 'SSLE')
                    )
                  ELSE avg(b.rating) FILTER (WHERE b.instrument = $1)
                END AS sort_mean_rating,
                CASE
                  WHEN $1::text IS NULL THEN
                    coalesce(
                      sum(b.n_responses) FILTER (WHERE b.instrument = 'SEI'),
                      sum(b.n_responses) FILTER (WHERE b.instrument = 'SSLE')
                    )
                  ELSE sum(b.n_responses) FILTER (WHERE b.instrument = $1)
                END AS sort_total_responses,
                CASE
                  WHEN $1::text IS NULL THEN
                    coalesce(
                      count(DISTINCT b.section_id) FILTER (WHERE b.instrument = 'SEI'),
                      count(DISTINCT b.section_id) FILTER (WHERE b.instrument = 'SSLE')
                    )
                  ELSE count(DISTINCT b.section_id) FILTER (WHERE b.instrument = $1)
                END AS sort_section_count,
                max(b.term_sort_key) AS last_term_sort_key
              FROM base b
              GROUP BY
                b.instructor_id, b.name_dot_number,
                b.current_first_name, b.current_last_name
            ),
            candidate_ranks AS (
              SELECT
                candidate.*,
                count(*) OVER ()::integer AS total_count,
                row_number() OVER (ORDER BY ${instructorSort})::integer AS candidate_rank
              FROM candidate_stats candidate
            ),
            candidates AS (
              SELECT *
              FROM candidate_ranks
              WHERE candidate_rank > $10
                AND candidate_rank <= $10 + $11
            )
            SELECT
              b.instructor_id,
              b.name_dot_number,
              b.current_first_name,
              b.current_last_name,
              b.instrument,
              count(*)::integer AS evaluation_count,
              count(DISTINCT b.section_id)::integer AS section_count,
              candidate.total_course_count AS course_count,
              count(DISTINCT b.course_id)::integer AS metric_course_count,
              candidate.total_course_count,
              candidate.departments,
              sum(b.n_responses)::bigint AS total_responses,
              sum(b.invited_count)::bigint AS total_invited,
              round(avg(b.rating), 4) AS mean_section_rating,
              round(sum(b.rating * b.n_responses)::numeric / nullif(sum(b.n_responses), 0), 4) AS response_weighted_rating,
              round((sum(b.n_responses)::numeric / nullif(sum(b.invited_count), 0)) * 100.0, 2) AS pooled_response_rate,
              min(b.term_sort_key) AS first_term_sort_key,
              max(b.term_sort_key) AS last_term_sort_key,
              candidate.total_count,
              candidate.candidate_rank AS search_position
            FROM base b
            JOIN candidates candidate ON candidate.instructor_id = b.instructor_id
            GROUP BY
              b.instructor_id, b.name_dot_number, b.current_first_name, b.current_last_name,
              b.instrument, candidate.total_course_count, candidate.departments,
              candidate.total_count, candidate.candidate_rank
            ORDER BY candidate.candidate_rank, b.instrument
            `,
            [...filterValues, offset, request.limit],
          ),
      request.kind === "instructors"
        ? Promise.resolve({ rows: [] as DbCourseSummaryRow[] })
        : queryDatabase<DbCourseSummaryRow>(
            `
            ${SEARCH_BASE_CTE},
            candidate_stats AS (
              SELECT
                b.course_id,
                b.course_key,
                b.subject,
                b.catalog,
                b.catalog_raw,
                min(b.class_title) AS class_title,
                array_agg(DISTINCT b.college ORDER BY b.college) AS colleges,
                array_agg(DISTINCT b.department ORDER BY b.department) AS departments,
                count(DISTINCT b.instructor_id)::integer AS instructor_count,
                count(DISTINCT b.section_id)::integer AS section_count,
                sum(b.n_responses)::bigint AS total_responses,
                round(avg(b.rating), 4) AS mean_section_rating,
                CASE
                  WHEN $1::text IS NULL THEN
                    coalesce(
                      avg(b.rating) FILTER (WHERE b.instrument = 'SEI'),
                      avg(b.rating) FILTER (WHERE b.instrument = 'SSLE')
                    )
                  ELSE avg(b.rating) FILTER (WHERE b.instrument = $1)
                END AS sort_mean_rating,
                CASE
                  WHEN $1::text IS NULL THEN
                    coalesce(
                      sum(b.n_responses) FILTER (WHERE b.instrument = 'SEI'),
                      sum(b.n_responses) FILTER (WHERE b.instrument = 'SSLE')
                    )
                  ELSE sum(b.n_responses) FILTER (WHERE b.instrument = $1)
                END AS sort_total_responses,
                CASE
                  WHEN $1::text IS NULL THEN
                    coalesce(
                      count(DISTINCT b.section_id) FILTER (WHERE b.instrument = 'SEI'),
                      count(DISTINCT b.section_id) FILTER (WHERE b.instrument = 'SSLE')
                    )
                  ELSE count(DISTINCT b.section_id) FILTER (WHERE b.instrument = $1)
                END AS sort_section_count,
                max(b.term_sort_key) AS last_term_sort_key
              FROM base b
              GROUP BY
                b.course_id, b.course_key, b.subject,
                b.catalog, b.catalog_raw
            ),
            candidate_ranks AS (
              SELECT
                candidate.*,
                count(*) OVER ()::integer AS total_count,
                row_number() OVER (ORDER BY ${courseSort})::integer AS candidate_rank
              FROM candidate_stats candidate
            ),
            candidates AS (
              SELECT *
              FROM candidate_ranks
              WHERE candidate_rank > $10
                AND candidate_rank <= $10 + $11
            )
            SELECT
              b.course_id,
              b.course_key,
              b.subject,
              b.catalog,
              b.catalog_raw,
              candidate.class_title,
              candidate.colleges,
              candidate.departments,
              candidate.instructor_count,
              candidate.section_count,
              b.instrument,
              count(*)::integer AS evaluation_count,
              count(DISTINCT b.section_id)::integer AS metric_section_count,
              sum(b.n_responses)::bigint AS total_responses,
              sum(b.invited_count)::bigint AS total_invited,
              round(avg(b.rating), 4) AS mean_section_rating,
              round(sum(b.rating * b.n_responses)::numeric / nullif(sum(b.n_responses), 0), 4) AS response_weighted_rating,
              round((sum(b.n_responses)::numeric / nullif(sum(b.invited_count), 0)) * 100.0, 2) AS pooled_response_rate,
              min(b.term_sort_key) AS first_term_sort_key,
              max(b.term_sort_key) AS last_term_sort_key,
              candidate.total_count,
              candidate.candidate_rank AS search_position
            FROM base b
            JOIN candidates candidate ON candidate.course_id = b.course_id
            GROUP BY
              b.course_id, b.course_key, b.subject, b.catalog, b.catalog_raw,
              candidate.class_title, candidate.colleges, candidate.departments,
              candidate.instructor_count, candidate.section_count, b.instrument,
              candidate.total_count, candidate.candidate_rank
            ORDER BY candidate.candidate_rank, b.instrument
            `,
            [...filterValues, offset, request.limit],
          ),
    ]);

    const [instructorTotal, courseTotal] = await Promise.all([
      request.kind === "courses"
        ? Promise.resolve(0)
        : instructorResult.rows.length
          ? Promise.resolve(numberValue(instructorResult.rows[0].total_count))
          : countDatabaseSearchCandidates("instructor", request),
      request.kind === "instructors"
        ? Promise.resolve(0)
        : courseResult.rows.length
          ? Promise.resolve(numberValue(courseResult.rows[0].total_count))
          : countDatabaseSearchCandidates("course", request),
    ]);

    return {
      dataStatus: this.dataStatus,
      filters: request,
      pagination: {
        instructors: pageInfo(instructorTotal, request.page, request.limit),
        courses: pageInfo(courseTotal, request.page, request.limit),
      },
      instructors: mergeInstructorSummaries(instructorResult.rows),
      courses: mergeCourseSummaries(courseResult.rows),
    };
  }

  async getInstructor(key: string): Promise<InstructorDetail | null> {
    const instructorResult = await queryDatabase<DbInstructorRow>(
      `SELECT id AS instructor_id, name_dot_number, current_first_name, current_last_name
       FROM osu_eval.instructor WHERE name_dot_number = $1 LIMIT 1`,
      [key],
    );
    const instructor = instructorResult.rows[0];
    if (!instructor) return null;

    const [evaluationResult, nameResult, courseResult] = await Promise.all([
      queryDatabase<DbEvaluationRow>(
        `${DB_EVALUATION_DETAIL_SELECT}
         WHERE e.instructor_id = $1
           AND EXISTS (
             SELECT 1 FROM osu_eval.evaluation_source_state ess
             WHERE ess.evaluation_id = e.id AND ess.active
           )
         ORDER BY t.sort_key DESC, subj.code, c.catalog NULLS LAST, sec.class_number`,
        [instructor.instructor_id],
      ),
      queryDatabase<QueryResultRow & { first_name: string; last_name: string }>(
        `SELECT DISTINCT first_name, last_name
         FROM osu_eval.instructor_name_observation
         WHERE instructor_id = $1 ORDER BY last_name, first_name`,
        [instructor.instructor_id],
      ),
      queryDatabase<DbCourseSummaryRow>(
        `
        WITH base AS (
          SELECT
            e.section_id,
            e.instructor_id,
            e.instrument,
            e.n_responses,
            e.invited_count,
            e.rating,
            sec.class_title,
            sec.college,
            sec.department,
            t.sort_key AS term_sort_key,
            c.id AS course_id,
            c.course_key,
            c.catalog,
            c.catalog_raw,
            subj.code AS subject
          FROM osu_eval.evaluation e
          JOIN osu_eval.section sec ON sec.id = e.section_id
          JOIN osu_eval.term t ON t.id = sec.term_id
          JOIN osu_eval.course c ON c.id = sec.course_id
          JOIN osu_eval.subject subj ON subj.id = c.subject_id
          WHERE e.instructor_id = $1
            AND EXISTS (
              SELECT 1 FROM osu_eval.evaluation_source_state ess
              WHERE ess.evaluation_id = e.id AND ess.active
            )
        ),
        info AS (
          SELECT
            course_id,
            count(DISTINCT instructor_id)::integer AS instructor_count,
            count(DISTINCT section_id)::integer AS section_count,
            min(class_title) AS class_title,
            array_agg(DISTINCT college ORDER BY college) AS colleges,
            array_agg(DISTINCT department ORDER BY department) AS departments
          FROM base
          GROUP BY course_id
        )
        SELECT
          b.course_id,
          b.course_key,
          b.subject,
          b.catalog,
          b.catalog_raw,
          info.class_title,
          info.colleges,
          info.departments,
          info.instructor_count,
          info.section_count,
          b.instrument,
          count(*)::integer AS evaluation_count,
          count(DISTINCT b.section_id)::integer AS metric_section_count,
          sum(b.n_responses)::bigint AS total_responses,
          sum(b.invited_count)::bigint AS total_invited,
          round(avg(b.rating), 4) AS mean_section_rating,
          round(sum(b.rating * b.n_responses)::numeric / nullif(sum(b.n_responses), 0), 4) AS response_weighted_rating,
          round((sum(b.n_responses)::numeric / nullif(sum(b.invited_count), 0)) * 100.0, 2) AS pooled_response_rate,
          min(b.term_sort_key) AS first_term_sort_key,
          max(b.term_sort_key) AS last_term_sort_key
        FROM base b
        JOIN info ON info.course_id = b.course_id
        GROUP BY
          b.course_id, b.course_key, b.subject, b.catalog, b.catalog_raw,
          info.class_title, info.colleges, info.departments, info.instructor_count,
          info.section_count, b.instrument
        ORDER BY b.subject, b.catalog NULLS LAST, b.course_key, b.instrument
        `,
        [instructor.instructor_id],
      ),
    ]);

    const evaluations = evaluationResult.rows.map(evaluationFromDb);
    const summary: InstructorSummary = {
      id: asId(instructor.instructor_id),
      key: instructor.name_dot_number,
      name: `${instructor.current_first_name} ${instructor.current_last_name}`,
      firstName: instructor.current_first_name,
      lastName: instructor.current_last_name,
      metrics: metricsByInstrument(
        evaluations.map((evaluation) => ({
          instrument: evaluation.instrument,
          rating: evaluation.rating,
          responseCount: evaluation.responseCount,
          invitedCount: evaluation.invitedCount,
          term: evaluation.term,
          sectionId: `${evaluation.term}:${evaluation.classNumber}`,
          courseId: evaluation.courseKey,
        })),
      ),
      coursesTaught: new Set(
        evaluations.map((evaluation) => evaluation.courseKey),
      ).size,
      departments: [
        ...new Set(evaluations.map((evaluation) => evaluation.department)),
      ].sort(),
    };
    return {
      ...summary,
      title: "instructor",
      nameVariants: nameResult.rows.map(
        (row) => `${row.first_name} ${row.last_name}`,
      ),
      evaluations,
      courseSummaries: mergeCourseSummaries(courseResult.rows),
    };
  }

  async getCourse(key: string): Promise<CourseDetail | null> {
    const courseResult = await queryDatabase<DbCourseRow>(
      `
      SELECT c.id AS course_id, c.course_key, subj.code AS subject, c.catalog,
             c.catalog_raw, min(sec.class_title) AS class_title,
             array_agg(DISTINCT sec.college ORDER BY sec.college) AS colleges,
             array_agg(DISTINCT sec.department ORDER BY sec.department) AS departments,
             count(DISTINCT e.instructor_id)::integer AS instructor_count,
             count(DISTINCT sec.id)::integer AS section_count
      FROM osu_eval.course c
      JOIN osu_eval.subject subj ON subj.id = c.subject_id
      JOIN osu_eval.section sec ON sec.course_id = c.id
      JOIN osu_eval.evaluation e ON e.section_id = sec.id
      WHERE c.course_key = $1
        AND EXISTS (SELECT 1 FROM osu_eval.evaluation_source_state ess WHERE ess.evaluation_id = e.id AND ess.active)
      GROUP BY c.id, c.course_key, subj.code, c.catalog, c.catalog_raw
      LIMIT 1
      `,
      [key],
    );
    const course = courseResult.rows[0];
    if (!course) return null;

    const [evaluationResult, instructorResult] = await Promise.all([
      queryDatabase<DbEvaluationRow>(
        `${DB_EVALUATION_DETAIL_SELECT}
         WHERE sec.course_id = $1
           AND EXISTS (
             SELECT 1 FROM osu_eval.evaluation_source_state ess
             WHERE ess.evaluation_id = e.id AND ess.active
           )
         ORDER BY t.sort_key DESC, sec.class_number, i.name_dot_number`,
        [course.course_id],
      ),
      queryDatabase<DbInstructorSummaryRow>(
        `
        WITH base AS (
          SELECT
            e.section_id,
            e.instructor_id,
            e.instrument,
            e.n_responses,
            e.invited_count,
            e.rating,
            sec.course_id,
            sec.department,
            t.sort_key AS term_sort_key,
            i.name_dot_number,
            i.current_first_name,
            i.current_last_name
          FROM osu_eval.evaluation e
          JOIN osu_eval.section sec ON sec.id = e.section_id
          JOIN osu_eval.term t ON t.id = sec.term_id
          JOIN osu_eval.instructor i ON i.id = e.instructor_id
          WHERE sec.course_id = $1
            AND EXISTS (
              SELECT 1 FROM osu_eval.evaluation_source_state ess
              WHERE ess.evaluation_id = e.id AND ess.active
            )
        ),
        info AS (
          SELECT
            instructor_id,
            count(DISTINCT course_id)::integer AS total_course_count,
            array_agg(DISTINCT department ORDER BY department) AS departments
          FROM base
          GROUP BY instructor_id
        )
        SELECT
          b.instructor_id,
          b.name_dot_number,
          b.current_first_name,
          b.current_last_name,
          b.instrument,
          count(*)::integer AS evaluation_count,
          count(DISTINCT b.section_id)::integer AS section_count,
          info.total_course_count AS course_count,
          count(DISTINCT b.course_id)::integer AS metric_course_count,
          info.total_course_count,
          info.departments,
          sum(b.n_responses)::bigint AS total_responses,
          sum(b.invited_count)::bigint AS total_invited,
          round(avg(b.rating), 4) AS mean_section_rating,
          round(sum(b.rating * b.n_responses)::numeric / nullif(sum(b.n_responses), 0), 4) AS response_weighted_rating,
          round((sum(b.n_responses)::numeric / nullif(sum(b.invited_count), 0)) * 100.0, 2) AS pooled_response_rate,
          min(b.term_sort_key) AS first_term_sort_key,
          max(b.term_sort_key) AS last_term_sort_key
        FROM base b
        JOIN info ON info.instructor_id = b.instructor_id
        GROUP BY
          b.instructor_id, b.name_dot_number, b.current_first_name, b.current_last_name,
          b.instrument, info.total_course_count, info.departments
        ORDER BY b.current_last_name, b.current_first_name, b.name_dot_number, b.instrument
        `,
        [course.course_id],
      ),
    ]);

    const evaluations = evaluationResult.rows.map(evaluationFromDb);
    const metrics = metricsByInstrument(
      evaluations.map((evaluation) => ({
        instrument: evaluation.instrument,
        rating: evaluation.rating,
        responseCount: evaluation.responseCount,
        invitedCount: evaluation.invitedCount,
        term: evaluation.term,
        sectionId: `${evaluation.term}:${evaluation.classNumber}`,
        courseId: evaluation.courseKey,
      })),
    );
    const summary: CourseSummary = {
      id: asId(course.course_id),
      key: course.course_key,
      subject: course.subject,
      catalog: course.catalog,
      code: course.catalog
        ? `${course.subject} ${course.catalog}`
        : `${course.subject} (catalog unavailable)`,
      title: course.class_title,
      colleges: course.colleges ?? [],
      departments: course.departments ?? [],
      instructorCount: numberValue(course.instructor_count),
      sectionCount: numberValue(course.section_count),
      metrics,
    };
    return {
      ...summary,
      title: "course",
      evaluations,
      instructors: mergeInstructorSummaries(instructorResult.rows),
    };
  }

  async compare(targets: ComparisonTarget[]): Promise<ComparisonResponse> {
    const items = await Promise.all(
      targets.map(async (target): Promise<ComparisonItem | null> => {
        if (target.kind === "instructor") {
          const instructor = await this.getInstructor(target.key);
          return instructor ? { target, instructor } : null;
        }
        const course = await this.getCourse(target.key);
        return course ? { target, course } : null;
      }),
    );
    const presentIds = new Set(
      items
        .filter((item): item is ComparisonItem => item !== null)
        .map((item) => `${item.target.kind}:${item.target.key}`),
    );
    return {
      dataStatus: this.dataStatus,
      items: items.filter((item): item is ComparisonItem => item !== null),
      missingTargets: targets.filter(
        (target) => !presentIds.has(`${target.kind}:${target.key}`),
      ),
    };
  }

  async getFacets(filters: SearchFilters): Promise<FacetsResponse> {
    const facetResult = await queryDatabase<DbFacetRow>(
      `
      ${SEARCH_BASE_CTE}
      SELECT 'term'::text AS facet, term AS value, count(*)::integer AS count
      FROM base
      GROUP BY term, term_sort_key
      UNION ALL
      SELECT 'subject'::text AS facet, subject AS value, count(*)::integer AS count
      FROM base
      GROUP BY subject
      UNION ALL
      SELECT 'college'::text AS facet, college AS value, count(*)::integer AS count
      FROM base
      GROUP BY college
      UNION ALL
      SELECT 'campus'::text AS facet, campus AS value, count(*)::integer AS count
      FROM base
      GROUP BY campus
      UNION ALL
      SELECT 'department'::text AS facet, department AS value, count(*)::integer AS count
      FROM base
      GROUP BY department
      UNION ALL
      SELECT 'deliveryMode'::text AS facet, delivery_mode AS value, count(*)::integer AS count
      FROM base
      GROUP BY delivery_mode
      UNION ALL
      SELECT 'classSizeCategory'::text AS facet, class_size_category AS value, count(*)::integer AS count
      FROM base
      GROUP BY class_size_category
      `,
      searchFilterValues(filters),
    );
    const valuesFor = (facet: NonNullable<DbFacetRow["facet"]>) =>
      facetValues(facetResult.rows.filter((row) => row.facet === facet));
    return {
      dataStatus: this.dataStatus,
      terms: valuesFor("term").sort(
        (a, b) => termSortKey(b.value) - termSortKey(a.value),
      ),
      subjects: valuesFor("subject").sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      colleges: valuesFor("college").sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      campuses: valuesFor("campus").sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      departments: valuesFor("department").sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      deliveryModes: valuesFor("deliveryMode").sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
      classSizeCategories: valuesFor("classSizeCategory").sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    };
  }
}

function previewRow(row: EvaluationRecord): PreviewRow {
  const [subject, ...catalogParts] = row.courseCode.split(" ");
  const catalogText = catalogParts.join(" ");
  const catalog =
    catalogText === "(catalog unavailable)" ? null : catalogText || null;
  const [firstName = "", ...lastNameParts] = row.instructorName.split(" ");
  return {
    ...row,
    firstName,
    lastName: lastNameParts.join(" "),
    subject,
    catalog,
    termSortKey: termSortKey(row.term),
  };
}

const PREVIEW_ROWS: PreviewRow[] = previewEvaluations.map(previewRow);

function previewRows() {
  return PREVIEW_ROWS;
}

function previewInstructorSummary(rows: PreviewRow[]): InstructorSummary {
  const row = rows[0];
  const departments = [...new Set(rows.map((item) => item.department))].sort();
  const courseKeys = new Set(rows.map((item) => item.courseKey));
  return {
    id: row.instructorId,
    key: row.instructorKey,
    name: row.instructorName,
    firstName: row.firstName,
    lastName: row.lastName,
    coursesTaught: courseKeys.size,
    departments,
    metrics: metricsByInstrument(
      rows.map((item) => ({
        instrument: item.instrument,
        rating: item.rating,
        responseCount: item.responseCount,
        invitedCount: item.invitedCount,
        term: item.term,
        sectionId: `${item.term}:${item.classNumber}`,
        courseId: item.courseKey,
      })),
    ),
  };
}

function previewSortValue(
  summary: InstructorSummary | CourseSummary,
  sort: SearchSort,
  instrument: Instrument | undefined,
): number {
  const metric =
    summary.metrics.find((item) => item.instrument === instrument) ??
    summary.metrics.find((item) => item.instrument === "SEI") ??
    summary.metrics[0];
  if (sort === "responses_desc") return metric?.responseCount ?? 0;
  if (sort === "sections_desc") return metric?.sectionCount ?? 0;
  if (sort === "rating_desc") return metric?.meanSectionRating ?? 0;
  if (sort === "recent_desc") {
    return Math.max(
      ...summary.metrics.map((item) => termSortKey(item.termCoverage.last)),
      0,
    );
  }
  return 0;
}

function sortPreviewSummaries<T extends InstructorSummary | CourseSummary>(
  summaries: T[],
  sort: SearchSort,
  instrument: Instrument | undefined,
): T[] {
  return summaries.sort((a, b) => {
    if (sort !== "default") {
      const difference =
        previewSortValue(b, sort, instrument) -
        previewSortValue(a, sort, instrument);
      if (difference) return difference;
    }
    if ("lastName" in a && "lastName" in b) {
      return (
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName) ||
        a.key.localeCompare(b.key)
      );
    }
    if ("code" in a && "code" in b) {
      return a.code.localeCompare(b.code) || a.key.localeCompare(b.key);
    }
    return a.key.localeCompare(b.key);
  });
}

function previewCourseSummary(rows: PreviewRow[]): CourseSummary {
  const row = rows[0];
  const instructorKeys = new Set(rows.map((item) => item.instructorKey));
  const sectionKeys = new Set(
    rows.map((item) => `${item.term}:${item.classNumber}`),
  );
  return {
    key: row.courseKey,
    subject: row.subject,
    catalog: row.catalog,
    code: row.courseCode,
    title: row.courseTitle,
    colleges: [...new Set(rows.map((item) => item.college))].sort(),
    departments: [...new Set(rows.map((item) => item.department))].sort(),
    instructorCount: instructorKeys.size,
    sectionCount: sectionKeys.size,
    metrics: metricsByInstrument(
      rows.map((item) => ({
        instrument: item.instrument,
        rating: item.rating,
        responseCount: item.responseCount,
        invitedCount: item.invitedCount,
        term: item.term,
        sectionId: `${item.term}:${item.classNumber}`,
        courseId: item.courseKey,
      })),
    ),
  };
}

class PreviewRepository implements Repository {
  readonly dataStatus = PREVIEW_STATUS;

  async search(request: SearchRequest): Promise<SearchResponse> {
    const rows = filterPreviewRows(previewRows(), request);
    const instructorMap = new Map<string, PreviewRow[]>();
    const courseMap = new Map<string, PreviewRow[]>();
    for (const row of rows) {
      const instructorRows = instructorMap.get(row.instructorKey) ?? [];
      instructorRows.push(row);
      instructorMap.set(row.instructorKey, instructorRows);
      const courseRows = courseMap.get(row.courseKey) ?? [];
      courseRows.push(row);
      courseMap.set(row.courseKey, courseRows);
    }
    const allInstructors =
      request.kind === "courses"
        ? []
        : [...instructorMap.values()].map(previewInstructorSummary);
    const allCourses =
      request.kind === "instructors"
        ? []
        : [...courseMap.values()].map(previewCourseSummary);
    const sortedInstructors = sortPreviewSummaries(
      allInstructors,
      request.sort,
      request.instrument,
    );
    const sortedCourses = sortPreviewSummaries(
      allCourses,
      request.sort,
      request.instrument,
    );
    const instructors = sortedInstructors.slice(
      (request.page - 1) * request.limit,
      request.page * request.limit,
    );
    const courses = sortedCourses.slice(
      (request.page - 1) * request.limit,
      request.page * request.limit,
    );
    return {
      dataStatus: this.dataStatus,
      filters: request,
      pagination: {
        instructors: pageInfo(
          allInstructors.length,
          request.page,
          request.limit,
        ),
        courses: pageInfo(allCourses.length, request.page, request.limit),
      },
      instructors,
      courses,
    };
  }

  async getInstructor(key: string): Promise<InstructorDetail | null> {
    const rows = previewRows().filter((row) => row.instructorKey === key);
    if (!rows.length) return null;
    const summary = previewInstructorSummary(rows);
    const courseMap = new Map<string, PreviewRow[]>();
    for (const row of rows) {
      const courseRows = courseMap.get(row.courseKey) ?? [];
      courseRows.push(row);
      courseMap.set(row.courseKey, courseRows);
    }
    const nameVariants = [
      ...new Set(rows.map((row) => row.instructorName)),
    ].sort();
    return {
      ...summary,
      title: "instructor",
      nameVariants,
      evaluations: rows
        .slice()
        .sort(
          (a, b) =>
            b.termSortKey - a.termSortKey ||
            a.courseCode.localeCompare(b.courseCode),
        )
        .map((row) => row),
      courseSummaries: [...courseMap.values()]
        .map(previewCourseSummary)
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }

  async getCourse(key: string): Promise<CourseDetail | null> {
    const rows = previewRows().filter((row) => row.courseKey === key);
    if (!rows.length) return null;
    const summary = previewCourseSummary(rows);
    const instructorMap = new Map<string, PreviewRow[]>();
    for (const row of rows) {
      const instructorRows = instructorMap.get(row.instructorKey) ?? [];
      instructorRows.push(row);
      instructorMap.set(row.instructorKey, instructorRows);
    }
    return {
      ...summary,
      title: "course",
      evaluations: rows
        .slice()
        .sort(
          (a, b) =>
            b.termSortKey - a.termSortKey ||
            a.classNumber.localeCompare(b.classNumber),
        )
        .map((row) => row),
      instructors: [...instructorMap.values()]
        .map(previewInstructorSummary)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    };
  }

  async compare(targets: ComparisonTarget[]): Promise<ComparisonResponse> {
    const items = await Promise.all(
      targets.map(async (target): Promise<ComparisonItem | null> => {
        if (target.kind === "instructor") {
          const instructor = await this.getInstructor(target.key);
          return instructor ? { target, instructor } : null;
        }
        const course = await this.getCourse(target.key);
        return course ? { target, course } : null;
      }),
    );
    const presentIds = new Set(
      items
        .filter((item): item is ComparisonItem => item !== null)
        .map((item) => `${item.target.kind}:${item.target.key}`),
    );
    return {
      dataStatus: this.dataStatus,
      items: items.filter((item): item is ComparisonItem => item !== null),
      missingTargets: targets.filter(
        (target) => !presentIds.has(`${target.kind}:${target.key}`),
      ),
    };
  }

  async getFacets(filters: SearchFilters): Promise<FacetsResponse> {
    const rows = filterPreviewRows(previewRows(), filters);
    const countValues = (values: string[]) => {
      const counts = new Map<string, number>();
      for (const value of values)
        counts.set(value, (counts.get(value) ?? 0) + 1);
      return [...counts.entries()]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    };
    return {
      dataStatus: this.dataStatus,
      terms: countValues(rows.map((row) => row.term)),
      subjects: countValues(rows.map((row) => row.subject)),
      colleges: countValues(rows.map((row) => row.college)),
      campuses: countValues(rows.map((row) => row.campus)),
      departments: countValues(rows.map((row) => row.department)),
      deliveryModes: countValues(rows.map((row) => row.deliveryMode)),
      classSizeCategories: countValues(
        rows.map((row) => row.classSizeCategory),
      ),
    };
  }
}

function filterPreviewRows(rows: PreviewRow[], filters: SearchFilters) {
  const query = filters.query?.trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.instrument && row.instrument !== filters.instrument)
      return false;
    if (filters.subject && row.subject !== filters.subject) return false;
    if (filters.college && row.college !== filters.college) return false;
    if (filters.campus && row.campus !== filters.campus) return false;
    if (filters.department && row.department !== filters.department)
      return false;
    if (filters.deliveryMode && row.deliveryMode !== filters.deliveryMode)
      return false;
    if (
      filters.classSizeCategory &&
      row.classSizeCategory !== filters.classSizeCategory
    )
      return false;
    if (filters.term && row.term !== filters.term) return false;
    if (!query) return true;
    return [
      row.instructorName,
      row.instructorKey,
      row.courseCode,
      row.courseTitle,
      row.subject,
    ].some((value) => value.toLowerCase().includes(query));
  });
}

let repository: Repository | undefined;
export function getRepository(): Repository {
  repository ??= isDatabaseConfigured()
    ? new DatabaseRepository()
    : new PreviewRepository();
  return repository;
}

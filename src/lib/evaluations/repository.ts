import { isDatabaseConfigured, queryDatabase } from "@/lib/db";
import {
  buildMetrics,
  buildInstructorSummaries,
  SCORING_POLICY,
} from "./scoring";
import type {
  CourseEvaluationInput,
  CourseEvaluationSummary,
  EvaluationAggregateRow,
  EvaluationSource,
} from "./types";

const CACHE_TTL = 5 * 60_000;
const MAX_CACHED_ROWS = 4_000;
const rowCache = new Map<
  string,
  { expiresAt: number; rows: EvaluationAggregateRow[] }
>();
let cachedRowCount = 0;
let sourceCache: { expiresAt: number; value: EvaluationSource } | null = null;
let sourceRequest: Promise<EvaluationSource> | null = null;

const unavailableSource: EvaluationSource = {
  provider: "OSU Explorance Blue",
  url: "https://osu.bluera.com/osubpi/fbview.aspx",
  mode: "unavailable",
  importedAt: null,
  latestTerm: null,
  coverage: null,
};

function cacheRows(key: string, rows: EvaluationAggregateRow[]) {
  if (rows.length > MAX_CACHED_ROWS) return;
  const previous = rowCache.get(key);
  if (previous) cachedRowCount -= previous.rows.length;
  rowCache.delete(key);
  while (
    cachedRowCount + rows.length > MAX_CACHED_ROWS ||
    rowCache.size >= 200
  ) {
    const oldest = rowCache.keys().next().value;
    if (oldest === undefined) break;
    cachedRowCount -= rowCache.get(oldest)?.rows.length ?? 0;
    rowCache.delete(oldest);
  }
  rowCache.set(key, { expiresAt: Date.now() + CACHE_TTL, rows });
  cachedRowCount += rows.length;
}

async function getSource(bypassCache = false): Promise<EvaluationSource> {
  if (!bypassCache && sourceCache && sourceCache.expiresAt > Date.now())
    return sourceCache.value;
  if (sourceRequest) return sourceRequest;
  sourceRequest = (async () => {
    const result = await queryDatabase<{
      name: string;
      completed_at: Date | string | null;
      first_term: string | null;
      last_term: string | null;
    }>(`
      SELECT d.name, r.completed_at,
        (SELECT label FROM osu_eval.term ORDER BY sort_key ASC LIMIT 1) AS first_term,
        (SELECT label FROM osu_eval.term ORDER BY sort_key DESC LIMIT 1) AS last_term
      FROM osu_eval.source_dataset d
      JOIN osu_eval.ingest_run r ON r.source_dataset_id = d.id
      WHERE r.status = 'completed' AND d.source_code = 'osu_bluera_sei_ssle'
      ORDER BY r.completed_at DESC NULLS LAST LIMIT 1
    `);
    const row = result.rows[0];
    const value: EvaluationSource = {
      ...unavailableSource,
      provider: row?.name ?? unavailableSource.provider,
      mode: "postgres",
      importedAt: row?.completed_at
        ? new Date(row.completed_at).toISOString()
        : null,
      latestTerm: row?.last_term ?? null,
      coverage:
        row?.first_term && row.last_term
          ? `${row.first_term} – ${row.last_term}`
          : null,
    };
    sourceCache = { expiresAt: Date.now() + CACHE_TTL, value };
    return value;
  })();
  try {
    return await sourceRequest;
  } finally {
    sourceRequest = null;
  }
}

/** Set-based lookup. Raw evaluation rows stay in PostgreSQL. */
const COURSE_SQL = `
  WITH requested AS (
    SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
      AS input(subject, catalog, campus)
  )
  SELECT subj.code AS subject, c.catalog,
    i.name_dot_number, i.current_first_name AS first_name,
    i.current_last_name AS last_name, e.instrument,
    t.label AS term, t.sort_key AS term_sort_key,
    SUM(e.n_responses)::int AS responses,
    SUM(e.invited_count)::int AS invited,
    SUM(e.rating * e.n_responses)::float8 AS weighted_rating_total,
    COUNT(*)::int AS records
  FROM requested req
  JOIN osu_eval.subject subj ON subj.code = req.subject
  JOIN osu_eval.course c ON c.subject_id = subj.id AND c.catalog = req.catalog
  JOIN osu_eval.section sec ON sec.course_id = c.id
    AND (req.campus IS NULL OR sec.campus_code = req.campus)
  JOIN osu_eval.term t ON t.id = sec.term_id
  JOIN osu_eval.evaluation e ON e.section_id = sec.id
  JOIN osu_eval.instructor i ON i.id = e.instructor_id
  WHERE EXISTS (
    SELECT 1 FROM osu_eval.evaluation_source_state state
    WHERE state.evaluation_id = e.id AND state.active
  )
  GROUP BY subj.code, c.catalog, i.name_dot_number,
    i.current_first_name, i.current_last_name, e.instrument, t.label, t.sort_key
  ORDER BY subj.code, c.catalog, t.sort_key
`;

/**
 * A page-sized batch, keyed by `SUBJECT CATALOG`. Faculty matches apply only to
 * evaluations of this course. Failure is explicit and never replaced by preview data.
 */
export async function getCourseEvaluations(
  inputs: CourseEvaluationInput[],
  options: { bypassCache?: boolean } = {},
): Promise<Record<string, CourseEvaluationSummary>> {
  if (inputs.length > 50)
    throw new RangeError("At most 50 courses can be evaluated in one request.");
  if (!inputs.length) return {};
  // The public result contract is keyed by subject/catalog. Reject mixed-campus
  // duplicates instead of silently assigning another campus's evaluation history.
  const normalizedByCourse = new Map<string, CourseEvaluationInput>();
  for (const input of inputs) {
    const subject = input.subject.trim().toUpperCase().replace(/\s+/g, " ");
    const catalogNumber = input.catalogNumber.trim().toUpperCase();
    const campus = input.campus?.trim().toUpperCase() || undefined;
    const key = `${subject} ${catalogNumber}`;
    const existing = normalizedByCourse.get(key);
    if (existing && existing.campus !== campus) {
      throw new RangeError(
        "Batch courses by campus: a subject/catalog key cannot contain multiple campuses.",
      );
    }
    normalizedByCourse.set(key, {
      ...input,
      subject,
      catalogNumber,
      campus,
      instructors: [
        ...(existing?.instructors ?? []),
        ...(input.instructors ?? []),
      ],
    });
  }
  const normalized = [...normalizedByCourse.values()];
  const result: Record<string, CourseEvaluationSummary> = Object.create(null);
  const keyOf = (input: CourseEvaluationInput) =>
    `${input.subject} ${input.catalogNumber}`;
  const cacheKeyOf = (input: CourseEvaluationInput) =>
    `${keyOf(input)}\0${input.campus ?? "*"}`;
  try {
    if (!isDatabaseConfigured()) throw new Error("Database unavailable");
    const sourcePromise = getSource(options.bypassCache);
    const missing = normalized.filter((input) => {
      const cached = rowCache.get(cacheKeyOf(input));
      return options.bypassCache || !cached || cached.expiresAt <= Date.now();
    });
    const rowsPromise = missing.length
      ? queryDatabase<EvaluationAggregateRow>(COURSE_SQL, [
          missing.map((input) => input.subject),
          missing.map((input) => input.catalogNumber),
          missing.map((input) => input.campus || null),
        ])
      : Promise.resolve({ rows: [] as EvaluationAggregateRow[] });
    const [source, queried] = await Promise.all([sourcePromise, rowsPromise]);
    const newRows = new Map<string, EvaluationAggregateRow[]>();
    for (const row of queried.rows) {
      const key = `${row.subject} ${row.catalog}`;
      const list = newRows.get(key) ?? [];
      list.push(row);
      newRows.set(key, list);
    }
    for (const input of missing)
      cacheRows(cacheKeyOf(input), newRows.get(keyOf(input)) ?? []);
    for (const input of normalized) {
      const key = keyOf(input);
      const rows =
        newRows.get(key) ?? rowCache.get(cacheKeyOf(input))?.rows ?? [];
      const metrics = buildMetrics(rows);
      result[key] = {
        status: metrics.length ? "available" : "no-data",
        primary: metrics[0] ?? null,
        metrics,
        instructors: buildInstructorSummaries(input, rows),
        source,
        methodologyVersion: SCORING_POLICY.version,
      };
    }
  } catch {
    // Preserve official course results if the independent evaluation database is down.
    for (const input of normalized) {
      result[keyOf(input)] = {
        status: "unavailable",
        primary: null,
        metrics: [],
        instructors: buildInstructorSummaries(input, []),
        source: { ...unavailableSource },
        methodologyVersion: SCORING_POLICY.version,
      };
    }
  }
  return result;
}

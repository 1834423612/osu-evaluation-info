import type { AdminQuery } from "./admin-store.ts";
export type OfficialCourseMetadata = {
  campus: string;
  key: string;
  title: string;
  source:
    "official_catalog" | "official_catalog_history" | "official_evaluation";
  term: string | null;
};
export type OfficialCourseReference = Omit<OfficialCourseMetadata, "campus">;
export async function findExactOfficialCourseReferences(
  query: AdminQuery,
  search: string,
  campus: string = "ALL",
): Promise<OfficialCourseReference[] | null> {
  const key = search
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, "");
  if (!/^[A-Z]{2,20}\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/.test(key)) return null;
  const campuses =
    campus === "ALL" ? ["COL", "MNS", "LMA", "MRN", "NWK", "WST"] : [campus];
  const rows = await lookupOfficialCourseMetadata(
    query,
    campuses.map((campus) => ({ campus, key })),
  );
  return [
    ...new Map(
      rows.map((row) => [
        JSON.stringify([row.key, row.title, row.source, row.term]),
        { key: row.key, title: row.title, source: row.source, term: row.term },
      ]),
    ).values(),
  ];
}
const scopes = `scopes AS MATERIALIZED (
 SELECT v.run_id,v.published_at,term.code term_code FROM osu_catalog.snapshot_versions v
 JOIN osu_catalog.sync_runs r ON r.id=v.run_id AND r.status='complete'
 CROSS JOIN LATERAL jsonb_array_elements_text(r.terms) term(code) WHERE v.published_at IS NOT NULL
)`;
export const OFFICIAL_TARGET_METADATA_SQL = `WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS q(campus text,key text,subject text,number text)),${scopes}
 SELECT q.campus,q.key,coalesce(c.title,'') title,
   CASE WHEN c.present THEN 'official_catalog' WHEN h.source='official_evaluation' THEN 'official_evaluation' ELSE 'official_catalog_history' END source,
   coalesce(c.term_code,h.latest_term) term
 FROM requested q LEFT JOIN LATERAL (
   SELECT true present,c.title,s.term_code FROM scopes s JOIN osu_catalog.course_snapshots c
     ON c.last_seen_run=s.run_id AND c.term_code=s.term_code AND c.subject=q.subject AND c.catalog_number=q.number AND c.campus_code=q.campus
   ORDER BY s.published_at DESC,s.term_code DESC,c.title LIMIT 1
 ) c ON true LEFT JOIN LATERAL (
   SELECT source,latest_term FROM osu_rmp.instructor_course ic WHERE ic.active AND ic.campus_code=q.campus AND ic.course_key=q.key
     AND ic.source IN ('official_catalog','official_evaluation') ORDER BY source,latest_term DESC LIMIT 1
 ) h ON true WHERE c.present OR h.source IS NOT NULL ORDER BY q.campus,q.key`;
export async function lookupOfficialCourseMetadata(
  query: AdminQuery,
  targets: { campus: string; key: string }[],
): Promise<OfficialCourseMetadata[]> {
  const requested = [
    ...new Map(
      targets.map((target) => [
        JSON.stringify([target.campus, target.key]),
        target,
      ]),
    ).values(),
  ].flatMap((target) => {
    const parsed = /^([A-Z]{2,20})(\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2})$/.exec(
      target.key,
    );
    return parsed ? [{ ...target, subject: parsed[1], number: parsed[2] }] : [];
  });
  if (!requested.length) return [];
  const result = await query(OFFICIAL_TARGET_METADATA_SQL, [
      JSON.stringify(requested),
    ]),
    rows = result.rows as unknown as OfficialCourseMetadata[];
  const found = new Set(
      rows.map((row) => JSON.stringify([row.campus, row.key])),
    ),
    missing = requested.filter(
      (target) => !found.has(JSON.stringify([target.campus, target.key])),
    );
  if (missing.length) {
    // Rare hyphenated official subjects keep their canonical identity. This is
    // one set scan for missing targets, never one full scan per selected group.
    const fallback = await query(
      `WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS q(campus text,key text,subject text,number text)),${scopes}
     SELECT DISTINCT ON(q.campus,q.key) q.campus,q.key,c.title,'official_catalog'::text source,s.term_code term
     FROM scopes s JOIN osu_catalog.course_snapshots c ON c.last_seen_run=s.run_id AND c.term_code=s.term_code
     JOIN requested q ON q.campus=c.campus_code AND q.number=c.catalog_number AND q.subject=replace(c.subject,'-','')
     WHERE c.subject LIKE '%-%' ORDER BY q.campus,q.key,s.published_at DESC,c.title`,
      [JSON.stringify(missing)],
    );
    rows.push(...(fallback.rows as unknown as OfficialCourseMetadata[]));
  }
  return rows.sort(
    (a, b) => a.campus.localeCompare(b.campus) || a.key.localeCompare(b.key),
  );
}
export const OFFICIAL_REFERENCE_SQL = `WITH ${scopes},latest AS (
 SELECT DISTINCT ON(term_code) * FROM scopes ORDER BY term_code,published_at DESC
), catalog AS (
 SELECT c.subject||c.catalog_number key,c.title,'official_catalog'::text source,max(c.term_code)::text term
 FROM latest s CROSS JOIN LATERAL (
   SELECT subject,catalog_number,title,term_code FROM osu_catalog.course_snapshots c
   WHERE c.last_seen_run=s.run_id AND c.term_code=s.term_code OFFSET 0
 ) c
 GROUP BY c.subject,c.catalog_number,c.title
), history AS (
 SELECT DISTINCT course_key key,''::text title,CASE source WHEN 'official_evaluation' THEN 'official_evaluation' ELSE 'official_catalog_history' END source,NULL::text term
 FROM osu_rmp.instructor_course WHERE active AND source IN ('official_evaluation','official_catalog')
) SELECT * FROM catalog UNION ALL SELECT * FROM history LIMIT 200001`;
export async function loadOfficialCourseReferences(
  query: AdminQuery,
): Promise<OfficialCourseReference[]> {
  const result = await query(OFFICIAL_REFERENCE_SQL, []);
  if (result.rows.length > 200000)
    throw Error("Official course reference exceeds its bounded cache");
  return result.rows.map((row) => ({
    key: String(row.key)
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[^A-Z0-9.]/g, ""),
    title: String(row.title ?? ""),
    source: row.source as OfficialCourseReference["source"],
    term: row.term ? String(row.term) : null,
  }));
}

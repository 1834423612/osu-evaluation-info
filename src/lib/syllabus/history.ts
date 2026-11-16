import { isDatabaseConfigured, queryDatabase } from "../db.ts";
import { SyllabusError, validReferenceQuery } from "./normalize.ts";
import type {
  SyllabusReference,
  SyllabusReferenceQuery,
  SyllabusResult,
} from "./types.ts";

/** Exact course/campus links come from published catalog generations. A teacher match requires an equal official email. */
export const SYLLABUS_REFERENCES_SQL = `
WITH sections AS (
  SELECT DISTINCT ON (s.term_code,s.class_number) s.term_code,s.class_number,s.data
  FROM osu_catalog.section_snapshots s
  JOIN osu_catalog.sync_runs r ON r.id=s.last_seen_run AND r.status='complete' AND r.completed_at IS NOT NULL AND r.terms ? s.term_code
  JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id AND v.published_at IS NOT NULL
  WHERE s.subject=$1 AND s.catalog_number=$2 AND s.term_code<=$3 AND s.campus_code=$4
  ORDER BY s.term_code,s.class_number,v.published_at DESC,r.id DESC
), people AS (
  SELECT s.term_code,s.class_number,COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'name',i->>'displayName','email',lower(i->>'email'))) FILTER (WHERE i->>'displayName' IS NOT NULL),'[]'::jsonb) AS instructors
  FROM sections s
  LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'meetings')='array' THEN s.data->'meetings' ELSE '[]'::jsonb END) m ON true
  LEFT JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m->'instructors')='array' THEN m->'instructors' ELSE '[]'::jsonb END) i ON true
  GROUP BY s.term_code,s.class_number
), current_emails AS (
  SELECT DISTINCT i->>'email' AS email FROM people p, jsonb_array_elements(p.instructors) i
  WHERE p.term_code=$3 AND ($5='' OR p.class_number=$5) AND COALESCE(i->>'email','')<>''
)
SELECT d.data->'entry' AS entry,p.instructors,d.checked_at,
  EXISTS(SELECT 1 FROM jsonb_array_elements(p.instructors) i JOIN current_emails c ON c.email=i->>'email') AS same_instructor
FROM osu_syllabus.index_heads h
JOIN osu_syllabus.entry_observations o USING(run_id,term_id)
JOIN osu_syllabus.entries e ON e.code=o.code
JOIN people p ON p.term_code=e.term_code AND p.class_number=CASE
  WHEN e.class_number<>'' THEN e.class_number
  WHEN o.data->>'sectionIdentifier' ~* '^s_[0-9]{1,8}$' THEN substring(o.data->>'sectionIdentifier' FROM 3) END
JOIN LATERAL (SELECT data,checked_at FROM osu_syllabus.document_versions WHERE code=e.code
  ORDER BY osu_syllabus.official_modified(data->>'modifiedAt') DESC NULLS LAST,first_fetched_at DESC,content_hash DESC LIMIT 1) d ON true
WHERE e.subject=$1 AND e.catalog_number=$2 AND e.term_code<$3
  AND d.data->'entry'->>'entityId'=e.entity_id::text
  AND d.data->'entry'->>'termId'=e.term_id::text
  AND jsonb_array_length(d.data->'components')>0
ORDER BY same_instructor DESC,e.term_code DESC,e.class_number,e.code LIMIT 12
`;
export async function syllabusHistoricalReferences(
  query: SyllabusReferenceQuery,
): Promise<SyllabusResult<SyllabusReference[]>> {
  if (!validReferenceQuery(query)) throw new SyllabusError("invalid");
  if (!isDatabaseConfigured()) throw new SyllabusError("unavailable");
  const result = await queryDatabase<{
    entry: SyllabusReference["entry"];
    instructors: { name: string; email: string | null }[];
    same_instructor: boolean;
    checked_at: Date;
  }>(SYLLABUS_REFERENCES_SQL, [
    query.subject.toUpperCase(),
    query.catalogNumber.toUpperCase(),
    query.termCode,
    query.campusCode.toUpperCase(),
    query.classNumber || "",
  ]);
  return {
    data: result.rows.map((row) => ({
      entry: row.entry,
      instructors: [
        ...new Set(
          row.instructors.map((person) => person.name).filter(Boolean),
        ),
      ],
      sameInstructor: row.same_instructor,
    })),
    source: "backup",
    fetchedAt: result.rows.length
      ? new Date(
          Math.min(
            ...result.rows.map((row) => new Date(row.checked_at).getTime()),
          ),
        ).toISOString()
      : new Date().toISOString(),
  };
}

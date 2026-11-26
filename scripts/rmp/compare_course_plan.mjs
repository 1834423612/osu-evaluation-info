// Compare public review pairs without changing any database rows or views.
import { readFile } from "node:fs/promises";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
loadCatalogEnvironment();
const plan = JSON.parse(
  await readFile(process.argv[2] ?? ".cache/rmp-course-plan.json", "utf8"),
);
const db = createCatalogClient("rmp-read-only-serving-comparison");
try {
  await db.connect();
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL statement_timeout='90s'");
  const marker = await db.query(
    "SELECT to_regclass('osu_rmp.course_decision') IS NOT NULL present",
  );
  const manual = marker.rows[0].present
    ? "osu_rmp.course_decision"
    : `(SELECT NULL::bigint professor_id,NULL::text campus_code,NULL::text raw_course_token,NULL::text action,NULL::text course_key WHERE false)`;
  const result = await db.query(
    `WITH stage AS MATERIALIZED (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS m(professor_id bigint,campus_code text,raw_course_token text,course_key text,state text)
  ), before AS MATERIALIZED (SELECT legacy_id,professor_id,campus_code,matched_course_key FROM osu_rmp.course_review_query),
  after AS MATERIALIZED (
    SELECT r.legacy_id,r.professor_id,c.campus_code,r.course_key matched_course_key
    FROM osu_rmp.review_query r
    JOIN (SELECT DISTINCT ps.professor_id,s.campus_code FROM osu_rmp.professor_school ps JOIN osu_rmp.school s ON s.legacy_id=ps.school_id) c USING(professor_id)
    LEFT JOIN ${manual} d ON d.professor_id=r.professor_id AND d.campus_code=c.campus_code AND d.raw_course_token=osu_rmp.review_course_token(r.class_name)
    WHERE d.professor_id IS NULL AND r.course_key IS NOT NULL
    UNION ALL
    SELECT r.legacy_id,r.professor_id,m.campus_code,m.course_key FROM stage m
    JOIN osu_rmp.review_query r ON r.professor_id=m.professor_id AND osu_rmp.review_course_token(r.class_name)=m.raw_course_token
    LEFT JOIN ${manual} d ON d.professor_id=m.professor_id AND d.campus_code=m.campus_code AND d.raw_course_token=m.raw_course_token
    WHERE m.state='accepted' AND m.course_key IS DISTINCT FROM r.course_key AND d.professor_id IS NULL
    UNION ALL
    SELECT r.legacy_id,r.professor_id,d.campus_code,d.course_key FROM ${manual} d
    JOIN osu_rmp.review_query r ON r.professor_id=d.professor_id AND osu_rmp.review_course_token(r.class_name)=d.raw_course_token WHERE d.action='bind'
  ), added AS (SELECT * FROM after EXCEPT SELECT * FROM before), removed AS (SELECT * FROM before EXCEPT SELECT * FROM after)
  SELECT (SELECT count(*)::int FROM before) before_review_pairs,(SELECT count(*)::int FROM after) proposed_review_pairs,
    (SELECT count(*)::int FROM added) added_review_pairs,(SELECT count(*)::int FROM removed) removed_review_pairs,
    (SELECT count(*)::int FROM after a WHERE EXISTS(SELECT 1 FROM osu_rmp.professor_identity_map i WHERE i.professor_id=a.professor_id AND i.state='accepted' AND (i.method='manual' OR i.evidence->'campus_codes' ? a.campus_code))) proposed_verified_identity_pairs,
    (SELECT count(*)::int FROM before a WHERE EXISTS(SELECT 1 FROM osu_rmp.professor_identity_map i WHERE i.professor_id=a.professor_id AND i.state='accepted' AND (i.method='manual' OR i.evidence->'campus_codes' ? a.campus_code))) before_verified_identity_pairs,
    (SELECT count(*)::int FROM after a GROUP BY legacy_id,campus_code,matched_course_key HAVING count(*)>1 LIMIT 1) duplicate_pair_example_count`,
    [
      JSON.stringify(
        plan.proposed_records.map(
          ({
            professor_id,
            campus_code,
            raw_course_token,
            course_key,
            state,
          }) => ({
            professor_id,
            campus_code,
            raw_course_token,
            course_key,
            state,
          }),
        ),
      ),
    ],
  );
  await db.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        readOnly: true,
        planSha256: plan.plan_sha256,
        ...result.rows[0],
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      error: "Serving comparison failed",
      sqlstate: error.code,
      operation: "read-only-comparison",
    }),
  );
  process.exitCode = 1;
} finally {
  await db.end();
}

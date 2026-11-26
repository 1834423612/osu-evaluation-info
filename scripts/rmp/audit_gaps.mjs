// Always read-only. No collector calls, DDL, refreshes, decisions or credentials.
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
loadCatalogEnvironment();
const db = createCatalogClient("rmp-read-only-binding-audit");
try {
  await db.connect();
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await db.query("SET LOCAL statement_timeout='60s'");
  const counts = await db.query(`SELECT state,count(*)::int labels,
    count(*) FILTER(WHERE raw_course_token ~ '^[0-9]')::int numeric_labels
    FROM osu_rmp.course_identity_match GROUP BY state ORDER BY state`);
  const reasons =
    await db.query(`SELECT reason,count(*)::int labels,sum(coalesce((evidence->>'review_count')::int,0))::int reviews
    FROM osu_rmp.course_identity_match WHERE raw_course_token ~ '^[0-9]' GROUP BY reason ORDER BY labels DESC`);
  const numeric = await db.query(`WITH official AS (
      SELECT DISTINCT c.campus_code,osu_rmp.review_course_token(c.subject) subject,
        c.catalog_number,osu_rmp.review_course_token(c.subject||c.catalog_number) course_key
      FROM osu_catalog.course_snapshots c JOIN osu_catalog.snapshot_versions v ON v.run_id=c.last_seen_run
      JOIN osu_catalog.sync_runs r ON r.id=v.run_id WHERE v.published_at IS NOT NULL AND r.status='complete'
    ), numeric AS (
      SELECT m.professor_id,m.campus_code,m.raw_course_token,m.state,m.reason,
        array_agg(DISTINCT o.course_key ORDER BY o.course_key) FILTER(WHERE o.course_key IS NOT NULL) candidates
      FROM osu_rmp.course_identity_match m
      JOIN osu_rmp.professor_identity_map i ON i.professor_id=m.professor_id AND i.state='accepted'
      LEFT JOIN osu_rmp.instructor_course ic ON ic.name_dot_number=i.name_dot_number AND ic.active AND ic.campus_code=m.campus_code
      LEFT JOIN official o ON o.campus_code=m.campus_code AND o.subject=osu_rmp.review_course_token(ic.subject) AND o.catalog_number=m.raw_course_token
      WHERE m.raw_course_token ~ '^[0-9]{3,5}([.][0-9]{1,3})?[A-Z]{0,2}$'
      GROUP BY m.professor_id,m.campus_code,m.raw_course_token,m.state,m.reason
    ) SELECT coalesce(cardinality(candidates),0) candidate_count,count(*)::int labels,
      count(*) FILTER(WHERE state<>'accepted')::int not_accepted FROM numeric GROUP BY 1 ORDER BY 1`);
  await db.query("COMMIT");
  console.log(
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        readOnly: true,
        storedCourseStates: counts.rows,
        numericReasons: reasons.rows,
        verifiedIdentityNumericCandidates: numeric.rows,
      },
      null,
      2,
    ),
  );
} catch {
  console.error("Read-only RMP audit unavailable; no changes were made.");
  process.exitCode = 1;
} finally {
  await db.end();
}

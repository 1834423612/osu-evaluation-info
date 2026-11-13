import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { COURSE_LEADS_SQL } from "../../src/lib/rmp/course-leads.ts";
test(
  "unconfirmed RMP course leads preserve campus, original labels and verified-score isolation",
  {
    skip:
      process.env.RMP_INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL,
    timeout: 30000,
  },
  async () => {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const rows = (
        await c.query(COURSE_LEADS_SQL, ["MNS", "MATH1131", [], true, 0])
      ).rows;
      assert(rows.length > 0);
      assert(rows.some((p) => !p.username));
      assert(
        rows.every((p) => p.campuses.length === 1 && p.campuses[0] === "MNS"),
      );
      for (const p of rows) {
        const count = await c.query(
          "SELECT count(*)::int n FROM osu_rmp.course_review_query WHERE professor_id=$1 AND campus_code='MNS' AND matched_course_key='MATH1131'",
          [p.id],
        );
        assert.equal(p.courseReviewCount, count.rows[0].n);
        assert(p.courseLabels.length > 0);
        if (p.username) {
          const verified = await c.query(
            "SELECT 1 FROM osu_rmp.instructor_course WHERE name_dot_number=$1 AND active AND campus_code='MNS' AND course_key='MATH1131'",
            [p.username],
          );
          assert.equal(verified.rowCount, 0);
        }
      }
      await c.query("ROLLBACK");
    } finally {
      await c.end();
    }
  },
);

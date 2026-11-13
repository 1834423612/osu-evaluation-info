import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { COURSE_SQL, REVIEW_PAGE_SQL } from "../../src/lib/rmp/queries.ts";
test(
  "course history retains every same-course/campus profile and paginates unconfirmed reviews inline",
  {
    skip:
      process.env.RMP_INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL,
    timeout: 120000,
  },
  async () => {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      statement_timeout: 30000,
    });
    await client.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const params = [[], "MNS", "MATH1131"];
      const summary = await client.query(COURSE_SQL, [
        ...params,
        "2024-11-13",
        true,
        true,
      ]);
      const expected = await client.query(
        `SELECT DISTINCT professor_id::text FROM osu_rmp.course_review_query WHERE campus_code=$1 AND matched_course_key=$2`,
        params.slice(1),
      );
      assert.deepEqual(
        summary.rows
          .filter((r) => r.review_count > 0)
          .map((r) => r.professor_id)
          .sort(),
        expected.rows.map((r) => r.professor_id).sort(),
      );
      const leads = summary.rows.filter(
        (r) => r.association === "unconfirmed" && r.review_count > 0,
      );
      assert(leads.some((r) => r.name_dot_number === null));
      for (const lead of leads) {
        let ids = [];
        for (let offset = 0; offset < lead.review_count; offset += 6) {
          const page = await client.query(REVIEW_PAGE_SQL, [
            ...params,
            6,
            lead.professor_id,
            offset,
            true,
          ]);
          assert.equal(page.rows[0].total, lead.review_count);
          ids.push(...page.rows[0].reviews.map((r) => r.id));
        }
        assert.equal(new Set(ids).size, lead.review_count);
        const selected = await client.query(REVIEW_PAGE_SQL, [
          ...params,
          6,
          lead.professor_id,
          0,
          false,
        ]);
        assert.equal(selected.rows[0].total, 0);
        const otherCourse = await client.query(REVIEW_PAGE_SQL, [
          [],
          "MNS",
          "MATH99999",
          6,
          lead.professor_id,
          0,
          true,
        ]);
        assert.equal(otherCourse.rows[0].total, 0);
      }
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  },
);

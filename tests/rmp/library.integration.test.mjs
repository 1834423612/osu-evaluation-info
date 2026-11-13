import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {
  LIBRARY_SEARCH_SQL,
  LIBRARY_COURSES_SQL,
  LIBRARY_REVIEWS_SQL,
  LIBRARY_PROFILE_FIELDS,
  LIBRARY_PROFILE_JOINS,
} from "../../src/lib/rmp/library-queries.ts";
test(
  "RMP library serves every saved profile and original course labels",
  {
    skip:
      process.env.RMP_INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL,
    timeout: 60000,
  },
  async (t) => {
    const c = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      statement_timeout: 20000,
    });
    await c.connect();
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await t.test(
        "all identity states and all six campuses remain reachable",
        async () => {
          for (const campus of [
            "ALL",
            "COL",
            "LMA",
            "MNS",
            "MRN",
            "NWK",
            "WST",
          ]) {
            const result = await c.query(LIBRARY_SEARCH_SQL, [
              campus,
              "all",
              [],
              24,
              0,
            ]);
            assert(result.rows.length > 0);
            const expected = await c.query(
              `SELECT count(*)::int total FROM osu_rmp.professor p WHERE $1='ALL' OR EXISTS(SELECT 1 FROM osu_rmp.professor_school ps JOIN osu_rmp.school s ON s.legacy_id=ps.school_id WHERE ps.professor_id=p.legacy_id AND s.campus_code=$1)`,
              [campus],
            );
            assert.equal(result.rows[0].total, expected.rows[0].total);
          }
        },
      );
      await t.test(
        "unconfirmed profiles expose their own reviews without borrowing an OSU identity",
        async () => {
          const result = await c.query(LIBRARY_SEARCH_SQL, [
            "MNS",
            "unverified",
            [],
            24,
            0,
          ]);
          const p = result.rows.find((x) => x.storedReviewCount > 0);
          assert(p);
          assert.equal(p.username, null);
          const courses = await c.query(LIBRARY_COURSES_SQL, [p.id]);
          assert.equal(
            courses.rows.reduce((n, x) => n + x.count, 0),
            p.storedReviewCount,
          );
          const course = courses.rows[0].code;
          const a = (await c.query(LIBRARY_REVIEWS_SQL, [p.id, course, 2, 0]))
            .rows[0];
          const b = (await c.query(LIBRARY_REVIEWS_SQL, [p.id, course, 2, 2]))
            .rows[0];
          assert.equal(a.total, courses.rows[0].count);
          assert(a.reviews.every((x) => x.course.trim() === course));
          assert(!a.reviews.some((x) => b.reviews.some((y) => x.id === y.id)));
          const profile = await c.query(
            `SELECT ${LIBRARY_PROFILE_FIELDS} ${LIBRARY_PROFILE_JOINS} WHERE p.legacy_id=$1`,
            [p.id],
          );
          assert.equal(profile.rows[0].id, p.id);
        },
      );
      await t.test(
        "course label search and escaped wildcard input execute safely",
        async () => {
          const match = await c.query(LIBRARY_SEARCH_SQL, [
            "ALL",
            "all",
            ["bio1100"],
            24,
            0,
          ]);
          assert(match.rows.length > 0);
          await c.query(LIBRARY_SEARCH_SQL, [
            "ALL",
            "all",
            ["100\\%", "test\\_name"],
            24,
            0,
          ]);
        },
      );
      await c.query("ROLLBACK");
    } finally {
      await c.end();
    }
  },
);

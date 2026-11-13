import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { COURSE_SQL, REVIEW_PAGE_SQL } from "../../src/lib/rmp/queries.ts";

test(
  "full-database RMP course links and serving queries",
  {
    skip:
      process.env.RMP_INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL,
    timeout: 120000,
  },
  async (t) => {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      statement_timeout: 20000,
    });
    await client.connect();
    const queryCourse = (params, history = false) =>
      client.query(COURSE_SQL, [...params, history]);
    const queryReviews = (params, history = false) =>
      client.query(REVIEW_PAGE_SQL, [...params, history]);
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await t.test(
        "normalization keeps official number/suffix identities",
        async () => {
          const result = await client.query(
            `SELECT osu_rmp.review_course_token(value) token
        FROM unnest($1::text[]) value`,
            [["ＢＩＯ－１１００", "MATH 1151.01H", "BIO_1100"]],
          );
          assert.deepEqual(
            result.rows.map((r) => r.token),
            ["BIO1100", "MATH1151.01H", "BIO1100"],
          );
        },
      );
      await t.test(
        "all accepted course labels retain their source review IDs without duplicates",
        async () => {
          const result = await client.query(`WITH expected AS (
        SELECT r.legacy_id,m.campus_code,m.course_key
        FROM osu_rmp.course_identity_match m JOIN osu_rmp.review r
          ON r.professor_id=m.professor_id AND osu_rmp.review_course_token(r.class_name)=m.raw_course_token
        JOIN osu_rmp.professor p ON p.legacy_id=r.professor_id
        WHERE m.state='accepted' AND r.active AND p.active
      ) SELECT count(*)::int missing FROM expected e WHERE NOT EXISTS (
        SELECT 1 FROM osu_rmp.course_review_query q WHERE q.legacy_id=e.legacy_id
          AND q.campus_code=e.campus_code AND q.matched_course_key=e.course_key)`);
          assert.equal(result.rows[0].missing, 0);
          const duplicates =
            await client.query(`SELECT count(*)::int duplicates FROM (
        SELECT legacy_id,campus_code,matched_course_key FROM osu_rmp.course_review_query
        GROUP BY 1,2,3 HAVING count(*)>1) d`);
          assert.equal(duplicates.rows[0].duplicates, 0);
          const numbers =
            await client.query(`SELECT count(*)::int changed FROM osu_rmp.course_identity_match
            WHERE state='accepted' AND regexp_replace(raw_course_token,'^[A-Z]+','')
              <>regexp_replace(course_key,'^[A-Z]+','')`);
          assert.equal(numbers.rows[0].changed, 0);
        },
      );
      const chosen =
        await client.query(`SELECT DISTINCT ON (m.campus_code,m.reason)
        m.professor_id::text,m.campus_code,m.course_key,i.name_dot_number
      FROM osu_rmp.course_identity_match m JOIN osu_rmp.professor_identity_map i USING(professor_id)
      WHERE m.state='accepted' AND i.state='accepted'
        AND (i.method='manual' OR i.evidence->'campus_codes' ? m.campus_code)
        AND (m.reason IN ('subject_alias','number_with_department')
          OR (m.campus_code='MNS' AND m.course_key IN ('MATH1131','MATH1151')))
        AND (m.evidence->>'review_count')::int>0
      ORDER BY m.campus_code,m.reason,m.professor_id LIMIT 16`);
      assert(chosen.rows.some((row) => row.campus_code === "MNS"));
      for (const row of chosen.rows)
        await t.test(
          `summary and pagination agree with source IDs: ${row.campus_code}/${row.course_key}`,
          async () => {
            const params = [
              [row.name_dot_number],
              row.campus_code,
              row.course_key,
            ];
            const expected = await client.query(
              `SELECT count(*)::int total FROM osu_rmp.review r
        WHERE r.active AND r.professor_id=$1::bigint AND (osu_rmp.course_key(r.class_name)=$3
          OR EXISTS(SELECT 1 FROM osu_rmp.course_identity_match m WHERE m.professor_id=r.professor_id
            AND m.campus_code=$2 AND m.course_key=$3 AND m.state='accepted'
            AND m.raw_course_token=osu_rmp.review_course_token(r.class_name)))`,
              [row.professor_id, row.campus_code, row.course_key],
            );
            const summary = await queryCourse([...params, "2024-11-13", true]);
            const profile = summary.rows.find(
              (p) => p.professor_id === row.professor_id,
            );
            assert.equal(profile?.review_count, expected.rows[0].total);
            assert(profile.review_count > 0);
            const first = await queryReviews([
              ...params,
              6,
              row.professor_id,
              0,
            ]);
            assert.equal(first.rows[0].total, profile.review_count);
            assert.equal(
              first.rows[0].reviews.length,
              Math.min(6, profile.review_count),
            );
            if (profile.review_count > 6) {
              const second = await queryReviews([
                ...params,
                6,
                row.professor_id,
                6,
              ]);
              assert(
                second.rows[0].reviews.every(
                  (r) => !first.rows[0].reviews.some((a) => a.id === r.id),
                ),
              );
            }
            const schools = await client.query(
              `SELECT DISTINCT s.campus_code FROM osu_rmp.professor_school ps
              JOIN osu_rmp.school s ON s.legacy_id=ps.school_id WHERE ps.professor_id=$1::bigint`,
              [row.professor_id],
            );
            const unauthorized = [
              "COL",
              "MNS",
              "LMA",
              "MRN",
              "NWK",
              "WST",
            ].find((code) => !schools.rows.some((s) => s.campus_code === code));
            if (!unauthorized) return;
            const wrongCampus = await queryReviews([
              [row.name_dot_number],
              unauthorized,
              row.course_key,
              6,
              row.professor_id,
              0,
            ]);
            assert.equal(wrongCampus.rows[0].total, 0);
          },
        );
      await t.test(
        "Mansfield mathematics and biology aliases are reachable through the real queries",
        async () => {
          for (const course of ["MATH1131", "MATH1151"]) {
            const instructors = await client.query(
              `SELECT DISTINCT name_dot_number FROM osu_rmp.instructor_course
            WHERE active AND campus_code='MNS' AND course_key=$1`,
              [course],
            );
            const summary = await queryCourse([
              instructors.rows.map((row) => row.name_dot_number),
              "MNS",
              course,
              "2024-11-13",
              true,
            ]);
            assert(
              summary.rows.reduce((count, row) => count + row.review_count, 0) >
                0,
              course,
            );
          }
          const biology =
            await client.query(`SELECT m.campus_code,i.name_dot_number,m.professor_id::text FROM osu_rmp.course_identity_match m
          JOIN osu_rmp.professor_identity_map i USING(professor_id)
          WHERE m.raw_course_token='BIO1101' AND m.course_key='BIOLOGY1101' AND m.state='accepted' AND i.state='accepted'`);
          assert(biology.rows.length > 0);
          for (const row of biology.rows) {
            const summary = await queryCourse([
              [row.name_dot_number],
              row.campus_code,
              "BIOLOGY1101",
              "2024-11-13",
              true,
            ]);
            assert(
              summary.rows.some(
                (profile) =>
                  profile.professor_id === row.professor_id &&
                  profile.review_count > 0,
              ),
            );
          }
        },
      );
      await t.test(
        "course history includes unconfirmed profiles while individual scores stay scoped",
        async () => {
          const course = [[], "MNS", "MATH1151", "2024-11-13", true];
          const selected = await queryCourse(course);
          assert.equal(selected.rows.length, 0);
          const history = await queryCourse(course, true);
          const withReviews = history.rows.filter(
            (row) => row.review_count > 0,
          );
          assert(withReviews.length >= 2);
          for (const row of withReviews.filter(
            (row) => row.association === "verified",
          )) {
            const individual = await queryCourse([
              [row.name_dot_number],
              "MNS",
              "MATH1151",
              "2024-11-13",
              true,
            ]);
            assert(
              individual.rows.every(
                (profile) => profile.name_dot_number === row.name_dot_number,
              ),
            );
            const page = [[], "MNS", "MATH1151", 6, row.professor_id, 0];
            assert.equal((await queryReviews(page)).rows[0].total, 0);
            assert.equal(
              (await queryReviews(page, true)).rows[0].total,
              row.review_count,
            );
          }
        },
      );
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  },
);

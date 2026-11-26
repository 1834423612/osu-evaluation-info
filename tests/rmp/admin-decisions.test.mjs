import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { rmpAdminSQL } from "../../src/lib/rmp/admin-namespace.ts";
import { writeCourseDecision } from "../../src/lib/rmp/admin-store.ts";

test("manual overlay survives rebuilds, blocks exact fallback, audits provenance and rejects stale edits", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE SCHEMA osu_rmp;
    CREATE TABLE osu_rmp.professor(legacy_id bigint PRIMARY KEY);
    INSERT INTO osu_rmp.professor VALUES(1);
    CREATE TABLE osu_rmp.school(legacy_id bigint,campus_code text);
    INSERT INTO osu_rmp.school VALUES(1,'COL');
    CREATE TABLE osu_rmp.professor_school(professor_id bigint,school_id bigint);
    INSERT INTO osu_rmp.professor_school VALUES(1,1);
    CREATE TABLE osu_rmp.review_query(legacy_id bigint,professor_id bigint,class_name text,course_key text);
    INSERT INTO osu_rmp.review_query VALUES(10,1,'1131',NULL),(11,1,'MATH 1131','MATH1131');
    CREATE TABLE osu_rmp.course_identity_match(professor_id bigint,campus_code text,raw_course_token text,course_key text,state text);
    INSERT INTO osu_rmp.course_identity_match VALUES(1,'COL','1131','STAT1131','accepted');
    CREATE FUNCTION osu_rmp.review_course_token(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT regexp_replace(upper(value),'[^A-Z0-9.]','','g')$$;`);
  const env = { NODE_ENV: "test", RMP_ADMIN_SCHEMA: "rmp_admin_test" };
  await db.exec(
    rmpAdminSQL(readFileSync("db/schemas/rmp-admin.sql", "utf8"), env),
  );
  const query = (sql, values) => db.query(sql, values);
  const base = {
    professorId: "1",
    campus: "COL",
    token: "1131",
    action: "bind",
    courseKey: "MATH1131",
    reason: "Official syllabus reviewed",
    evidenceUrls: ["https://math.osu.edu/course"],
    expectedVersion: 0,
  };
  assert.equal(
    (await writeCourseDecision(query, base, "account:admin", env)).version,
    1,
  );
  await db.exec(
    `UPDATE osu_rmp.course_identity_match SET course_key='STAT1131';`,
  );
  let rows = (
    await db.query(
      `SELECT matched_course_key FROM rmp_admin_test.course_review_query WHERE legacy_id=10`,
    )
  ).rows;
  assert.equal(rows[0].matched_course_key, "MATH1131");
  await assert.rejects(
    writeCourseDecision(query, base, "account:other", env),
    (e) => e.code === "conflict",
  );
  await writeCourseDecision(
    query,
    { ...base, action: "unbind", courseKey: null, expectedVersion: 1 },
    "account:admin",
    env,
  );
  assert.equal(
    (
      await db.query(
        `SELECT * FROM rmp_admin_test.course_review_query WHERE legacy_id=10`,
      )
    ).rows.length,
    0,
  );
  await writeCourseDecision(
    query,
    { ...base, token: "MATH1131", action: "reject", courseKey: null },
    "account:admin",
    env,
  );
  assert.equal(
    (
      await db.query(
        `SELECT * FROM rmp_admin_test.course_review_query WHERE legacy_id=11`,
      )
    ).rows.length,
    0,
  );
  rows = (
    await db.query(
      `SELECT previous_decision,decision FROM rmp_admin_test.course_decision_audit ORDER BY id`,
    )
  ).rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].decision.decided_by, "account:admin");
  assert.equal(rows[1].previous_decision.action, "bind");
  await assert.rejects(
    db.exec(`DELETE FROM rmp_admin_test.course_decision_audit`),
  );
  await assert.rejects(db.exec(`DELETE FROM rmp_admin_test.course_decision`));
  await db.exec(
    "BEGIN; UPDATE osu_rmp.course_identity_match SET course_key='MATH9999'; ROLLBACK;",
  );
  assert.equal(
    (await db.query("SELECT course_key FROM osu_rmp.course_identity_match"))
      .rows[0].course_key,
    "STAT1131",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_admin_test.course_decision_audit",
      )
    ).rows[0].n,
    3,
  );
  await db.exec("CREATE TABLE osu_rmp.app_migration(version text PRIMARY KEY)");
  await db.exec(
    rmpAdminSQL(readFileSync("db/schemas/rmp-admin.sql", "utf8"), {
      NODE_ENV: "production",
    }),
  );
  await writeCourseDecision(query, base, "account:admin", {
    NODE_ENV: "production",
  });
  await db.exec(readFileSync("db/schemas/rmp-course-matching.sql", "utf8"));
  assert.equal(
    (
      await db.query(
        "SELECT matched_course_key FROM osu_rmp.course_review_query WHERE legacy_id=10",
      )
    ).rows[0].matched_course_key,
    "MATH1131",
  );
});

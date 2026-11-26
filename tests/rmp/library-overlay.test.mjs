import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { LIBRARY_SEARCH_SQL } from "../../src/lib/rmp/library-queries.ts";
import {
  rmpServingSQL,
  rmpAdminSQL,
} from "../../src/lib/rmp/admin-namespace.ts";
import { writeCourseDecision } from "../../src/lib/rmp/admin-store.ts";
test("library course search retains profile-only mappings and applies campus-scoped manual decisions", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const previous = process.env.RMP_ADMIN_SCHEMA;
  process.env.RMP_ADMIN_SCHEMA = "rmp_library_test";
  t.after(() => {
    if (previous === undefined) delete process.env.RMP_ADMIN_SCHEMA;
    else process.env.RMP_ADMIN_SCHEMA = previous;
  });
  await db.exec(`CREATE SCHEMA osu_rmp;
 CREATE TABLE osu_rmp.professor(legacy_id bigint PRIMARY KEY,first_name text,last_name text,department text,active boolean DEFAULT true,avg_rating float8,avg_difficulty float8,would_take_again_percent float8,num_ratings integer DEFAULT 0,updated_at timestamptz DEFAULT now(),rating_tags jsonb,ratings_distribution jsonb,course_codes jsonb);
 INSERT INTO osu_rmp.professor(legacy_id,first_name,last_name,department,course_codes) VALUES(1,'Sam','Field','Mathematics','[{"courseName":"1131"}]');
 CREATE TABLE osu_rmp.school(legacy_id bigint,campus_code text);INSERT INTO osu_rmp.school VALUES(1,'COL'),(2,'MNS');
 CREATE TABLE osu_rmp.professor_school(professor_id bigint,school_id bigint);INSERT INTO osu_rmp.professor_school VALUES(1,1),(1,2);
 CREATE TABLE osu_rmp.professor_identity_map(professor_id bigint,name_dot_number text,state text);
 CREATE TABLE osu_rmp.instructor_identity(name_dot_number text,display_name text);
 CREATE TABLE osu_rmp.review(legacy_id bigint,professor_id bigint,class_name text,course_key text,active boolean);
 CREATE VIEW osu_rmp.review_query AS SELECT * FROM osu_rmp.review;
 CREATE TABLE osu_rmp.course_identity_match(professor_id bigint,campus_code text,raw_course_token text,course_key text,state text);
 INSERT INTO osu_rmp.course_identity_match VALUES(1,'COL','1131','MATH1131','accepted'),(1,'MNS','1131','STAT1131','accepted');
 CREATE FUNCTION osu_rmp.review_course_token(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT regexp_replace(upper(value),'[^A-Z0-9.]','','g')$$;`);
  await db.exec(rmpAdminSQL(readFileSync("db/schemas/rmp-admin.sql", "utf8")));
  const search = async (key, campus = "COL") =>
      (
        await db.query(rmpServingSQL(LIBRARY_SEARCH_SQL), [
          campus,
          "all",
          [key],
          24,
          0,
        ])
      ).rows.map((row) => row.id),
    query = (sql, values) => db.query(sql, values),
    base = {
      professorId: "1",
      campus: "COL",
      token: "1131",
      action: "reject",
      courseKey: null,
      reason: "Reviewed original source",
      evidenceUrls: [],
      expectedVersion: 0,
    };
  assert.deepEqual(
    await search("MATH1131"),
    ["1"],
    "zero-review numeric profile labels remain discoverable by their accepted full course",
  );
  assert.deepEqual(
    await search("MATH1131", "MNS"),
    [],
    "derived mappings use the requested campus",
  );
  assert.deepEqual(await search("STAT1131", "MNS"), ["1"]);
  await writeCourseDecision(query, base, "account:admin");
  assert.deepEqual(
    await search("MATH1131"),
    [],
    "manual reject suppresses the derived association",
  );
  assert.deepEqual(
    await search("1131"),
    ["1"],
    "the original source label remains searchable",
  );
  assert.deepEqual(
    await search("STAT1131", "MNS"),
    ["1"],
    "a decision in COL does not affect MNS",
  );
  await writeCourseDecision(
    query,
    { ...base, action: "bind", courseKey: "CSE1131", expectedVersion: 1 },
    "account:admin",
  );
  assert.deepEqual(await search("MATH1131"), []);
  assert.deepEqual(
    await search("CSE1131"),
    ["1"],
    "a manual target is searchable without any reviews",
  );
  await writeCourseDecision(
    query,
    { ...base, action: "unbind", expectedVersion: 2 },
    "account:admin",
  );
  assert.deepEqual(await search("CSE1131"), []);
  assert.deepEqual(await search("MATH1131"), []);
  await db.exec(
    "INSERT INTO osu_rmp.review VALUES(10,1,'1151','MATH1151',true)",
  );
  assert.deepEqual(
    await search("MATH1151"),
    ["1"],
    "review-only exact fallback remains searchable",
  );
});

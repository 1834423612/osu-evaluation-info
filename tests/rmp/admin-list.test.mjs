import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { rmpAdminSQL } from "../../src/lib/rmp/admin-namespace.ts";
import { adminListSQL } from "../../src/lib/rmp/admin-queries.ts";
import {
  adminFiltersSchema,
  courseDecisionInput,
} from "../../src/lib/rmp/admin-input.ts";
test("admin filters combine course, professor, keyword, status and campus with stable pages", async (t) => {
  const previous = process.env.RMP_ADMIN_SCHEMA;
  process.env.RMP_ADMIN_SCHEMA = "rmp_admin_test";
  const db = new PGlite();
  t.after(async () => {
    await db.close();
    if (previous === undefined) delete process.env.RMP_ADMIN_SCHEMA;
    else process.env.RMP_ADMIN_SCHEMA = previous;
  });
  await db.exec(`CREATE SCHEMA osu_rmp;
    CREATE SCHEMA osu_catalog;
    CREATE TABLE osu_catalog.course_snapshots(subject text,catalog_number text,data jsonb,last_seen_run text);
    INSERT INTO osu_catalog.course_snapshots VALUES('MATH','1131','{"title":"Business Calculus"}','run');
    CREATE TABLE osu_catalog.snapshot_versions(run_id text,published_at timestamptz); INSERT INTO osu_catalog.snapshot_versions VALUES('run',now());
    CREATE TABLE osu_catalog.sync_runs(id text,status text); INSERT INTO osu_catalog.sync_runs VALUES('run','complete');
    CREATE TABLE osu_rmp.professor(legacy_id bigint PRIMARY KEY,first_name text,last_name text,department text,course_codes jsonb DEFAULT '[]',active boolean DEFAULT true,updated_at timestamptz DEFAULT now());
    INSERT INTO osu_rmp.professor(legacy_id,first_name,last_name,department) VALUES(1,'Sam','Field','Mathematics'),(2,'Nia','Tide','Biology');
    CREATE TABLE osu_rmp.school(legacy_id bigint,campus_code text); INSERT INTO osu_rmp.school VALUES(1,'COL'),(2,'MNS');
    CREATE TABLE osu_rmp.professor_school(professor_id bigint,school_id bigint); INSERT INTO osu_rmp.professor_school VALUES(1,1),(2,2);
    CREATE TABLE osu_rmp.professor_identity_map(professor_id bigint,name_dot_number text,state text); INSERT INTO osu_rmp.professor_identity_map VALUES(1,'field.1','accepted');
    CREATE TABLE osu_rmp.instructor_course(name_dot_number text,source text,source_record_key text,campus_code text,course_key text,subject text,catalog_number text,latest_term text,active boolean,last_seen_at timestamptz);
    CREATE TABLE osu_rmp.review(legacy_id bigint,professor_id bigint,class_name text,course_key text,comment text,active boolean,updated_at timestamptz DEFAULT now());
    INSERT INTO osu_rmp.review(legacy_id,professor_id,class_name,course_key,comment,active) VALUES(10,1,'1131',NULL,'Clear proofs',true),(11,2,'BIO1100','BIOLOGY1100','Field work',true);
    CREATE VIEW osu_rmp.review_query AS SELECT * FROM osu_rmp.review;
    CREATE TABLE osu_rmp.course_identity_match(professor_id bigint,campus_code text,raw_course_token text,course_key text,state text,reason text,candidates jsonb,evidence jsonb,updated_at timestamptz);
    INSERT INTO osu_rmp.course_identity_match VALUES(1,'COL','1131',NULL,'ambiguous','ambiguous_subject','["MATH1131","STAT1131"]','{}',now()),(2,'MNS','BIO1100','BIOLOGY1100','accepted','subject_alias','["BIOLOGY1100"]','{}',now());
    CREATE FUNCTION osu_rmp.review_course_token(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT regexp_replace(upper(value),'[^A-Z0-9.]','','g')$$;`);
  await db.exec(rmpAdminSQL(readFileSync("db/schemas/rmp-admin.sql", "utf8")));
  const search = (args) =>
    db
      .query(adminListSQL(), [
        ...args,
        args[0] === "Business Calculus" ? ["MATH1131"] : [],
      ])
      .then((result) => result.rows[0]);
  let result = await search([
    "MATH1131",
    "field.1",
    "ambiguous",
    "COL",
    "proofs",
    30,
    0,
  ]);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].professorId, "1");
  assert.equal(result.items[0].reviewCount, 1);
  assert.equal(
    (await search(["Business Calculus", "", "all", "ALL", "", 30, 0])).total,
    1,
  );
  assert.equal(
    (await search(["MATH 1131", "", "all", "ALL", "", 30, 0])).total,
    1,
  );
  assert.equal(
    (await search(["", "", "all", "MNS", "proofs", 30, 0])).total,
    0,
  );
  result = await search(["", "", "all", "ALL", "", 1, 1]);
  assert.equal(result.total, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].professorId, "2");
  result = await search(["", "", "all", "ALL", "", 30, 30]);
  assert.equal(result.total, 2);
  assert.deepEqual(result.items, []);
});
test("administration input rejects unbounded, injected and inconsistent decisions", () => {
  for (const input of [
    { page: 0 },
    { page: 1000000 },
    { status: "x' OR 1=1" },
    { keyword: "a".repeat(201) },
  ])
    assert.equal(adminFiltersSchema.safeParse(input).success, false);
  const base = {
    professorId: "1",
    campus: "COL",
    token: "1131",
    action: "bind",
    courseKey: "MATH1131",
    reason: "Reviewed syllabus",
    evidenceUrls: [],
    expectedVersion: 0,
  };
  for (const input of [
    { ...base, action: "unbind" },
    { ...base, expectedVersion: -1 },
    { ...base, evidenceUrls: ["javascript:alert(1)"] },
    { ...base, courseKey: "MATH1131;DELETE" },
  ])
    assert.equal(courseDecisionInput.safeParse(input).success, false);
});

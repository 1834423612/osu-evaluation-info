import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  lookupOfficialCourseMetadata,
  loadOfficialCourseReferences,
  findExactOfficialCourseReferences,
  filterOfficialCourseReferences,
} from "../../src/lib/rmp/official-courses.ts";
test("official targets use published run JSONB term scope and retain exact active official history", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const query = (sql, values) => db.query(sql, values);
  await db.exec(`CREATE SCHEMA osu_catalog;CREATE SCHEMA osu_rmp;
 CREATE TABLE osu_catalog.sync_runs(id text PRIMARY KEY,status text,terms jsonb);
 INSERT INTO osu_catalog.sync_runs VALUES('old','complete','["1268"]'),('new','complete','["1272"]'),('draft','complete','["1282"]');
 CREATE TABLE osu_catalog.snapshot_versions(run_id text PRIMARY KEY,published_at timestamptz);
 INSERT INTO osu_catalog.snapshot_versions VALUES('old','2025-01-01'),('new','2026-01-01'),('draft',NULL);
 CREATE TABLE osu_catalog.course_snapshots(last_seen_run text,term_code text,subject text,catalog_number text,campus_code text,title text);
 CREATE INDEX course_snapshots_lookup ON osu_catalog.course_snapshots(last_seen_run,term_code,subject,catalog_number,campus_code);
 INSERT INTO osu_catalog.course_snapshots VALUES('old','1268','MATH','1131','COL','Calculus'),('new','1272','MATH','1151.01','COL','Calculus I'),('new','1268','MATH','9999','COL','Wrong term'),('draft','1282','MATH','8888','COL','Draft'),('new','1272','NEW-SCI','1100','COL','New science');
 CREATE TABLE osu_rmp.instructor_course(campus_code text,course_key text,subject text,catalog_number text,source text,latest_term text,active boolean);
 INSERT INTO osu_rmp.instructor_course VALUES('COL','ASL1101','ASL','1101','official_evaluation','AU 14',true),('MNS','ASL1102','ASL','1102','official_evaluation','AU 14',true),('COL','ASL1103','ASL','1103','official_evaluation','AU 14',false),('COL','FAKE1100','FAKE','1100','web_guess','AU 14',true);`);
  const requested = [
    "MATH1131",
    "MATH1151.01",
    "MATH1151",
    "MATH9999",
    "MATH8888",
    "ASL1101",
    "ASL1102",
    "ASL1103",
    "FAKE1100",
    "NEWSCI1100",
  ].map((key) => ({ campus: "COL", key }));
  const found = await lookupOfficialCourseMetadata(query, requested);
  assert.deepEqual(
    found.map((row) => row.key).sort(),
    ["ASL1101", "MATH1131", "MATH1151.01", "NEWSCI1100"].sort(),
  );
  assert.equal(
    found.find((row) => row.key === "ASL1101").source,
    "official_evaluation",
  );
  const refs = await loadOfficialCourseReferences(query);
  assert(
    refs.some((row) => row.key === "MATH1131" && row.title === "Calculus"),
  );
  assert(
    refs.some(
      (row) => row.key === "ASL1101" && row.source === "official_evaluation",
    ),
  );
  assert(
    !filterOfficialCourseReferences(refs, "ASL", "COL").some(
      (row) => row.key === "ASL1102",
    ),
  );
  assert(
    filterOfficialCourseReferences(refs, "ASL", "MNS").some(
      (row) => row.key === "ASL1102",
    ),
  );
  assert(
    filterOfficialCourseReferences(refs, "ASL").some(
      (row) => row.key === "ASL1102",
    ),
  );
  assert(
    !refs.some((row) =>
      ["MATH9999", "MATH8888", "ASL1103", "FAKE1100"].includes(row.key),
    ),
  );
  let requestedCount = 0;
  await lookupOfficialCourseMetadata(
    async (sql, values) => {
      if (values?.[0])
        requestedCount = Math.max(requestedCount, JSON.parse(values[0]).length);
      return query(sql, values);
    },
    Array.from({ length: 100 }, () => ({ campus: "COL", key: "ASL1101" })),
  );
  assert.equal(
    requestedCount,
    1,
    "repeated targets are validated as one unique campus/course pair",
  );
});
test("manual full-code search finds older same-term published courses in the selected campus", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const query = (sql, values) => db.query(sql, values);
  await db.exec(`CREATE SCHEMA osu_catalog;CREATE SCHEMA osu_rmp;
 CREATE TABLE osu_catalog.sync_runs(id text,status text,terms jsonb);
 INSERT INTO osu_catalog.sync_runs VALUES('old','complete','["1268"]'),('new','complete','["1268"]');
 CREATE TABLE osu_catalog.snapshot_versions(run_id text PRIMARY KEY,published_at timestamptz);
 INSERT INTO osu_catalog.snapshot_versions VALUES('old','2025-01-01'),('new','2026-01-01');
 CREATE TABLE osu_catalog.course_snapshots(last_seen_run text,term_code text,subject text,catalog_number text,campus_code text,title text);
 INSERT INTO osu_catalog.course_snapshots VALUES('old','1268','MATH','1131','COL','Historic Calculus'),('new','1268','MATH','1151','COL','Calculus I');
 CREATE TABLE osu_rmp.instructor_course(campus_code text,course_key text,source text,latest_term text,active boolean);`);
  assert.equal(
    (await loadOfficialCourseReferences(query)).some(
      (row) => row.key === "MATH1131",
    ),
    false,
    "title suggestions use latest published snapshot per term",
  );
  assert.equal(
    (await findExactOfficialCourseReferences(query, "MATH 1131", "COL"))[0]
      .title,
    "Historic Calculus",
  );
  assert.deepEqual(
    await findExactOfficialCourseReferences(query, "MATH1131", "MNS"),
    [],
  );
  assert.equal(
    await findExactOfficialCourseReferences(query, "Calculus", "COL"),
    null,
  );
});

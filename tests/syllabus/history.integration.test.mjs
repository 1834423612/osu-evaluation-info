import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadCatalogEnvironment } from "../../scripts/catalog/database.mjs";
import { syllabusHistoricalReferences } from "../../src/lib/syllabus/history.ts";
import { validReferenceQuery } from "../../src/lib/syllabus/normalize.ts";

test("historical syllabus queries require an exact campus, course, term and optional class", () => {
  const q = {
    subject: "ART",
    catalogNumber: "2000",
    termCode: "1272",
    campusCode: "COL",
  };
  assert.equal(validReferenceQuery(q), true);
  for (const input of [
    { campusCode: "ALL" },
    { termCode: "1279" },
    { classNumber: "1 OR 1=1" },
    { subject: "ART;DROP" },
  ])
    assert.equal(validReferenceQuery({ ...q, ...input }), false);
});
test(
  "historical references prefer the latest same-email teacher and exclude unrelated or unpublished sections",
  { skip: process.env.SYLLABUS_DATABASE_TEST !== "1", timeout: 30000 },
  async () => {
    loadCatalogEnvironment();
    const schema = "syllabus_history_test_" + randomUUID().replaceAll("-", "");
    const catalog = schema + "_cat";
    const db = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      statement_timeout: 8000,
    });
    const scoped = {
      query: (sql, values) =>
        db.query(
          sql
            .replaceAll("osu_syllabus", schema)
            .replaceAll("osu_catalog", catalog),
          values,
        ),
    };
    const previous = global.osuEvaluationPool;
    try {
      await db.connect();
      await scoped.query(`CREATE SCHEMA osu_syllabus; CREATE SCHEMA osu_catalog;
      CREATE TABLE osu_catalog.sync_runs(id uuid PRIMARY KEY,status text,completed_at timestamptz,terms jsonb);
      CREATE TABLE osu_catalog.snapshot_versions(run_id uuid,published_at timestamptz);
      CREATE TABLE osu_catalog.section_snapshots(last_seen_run uuid,term_code text,class_number text,subject text,catalog_number text,campus_code text,data jsonb);
      CREATE TABLE osu_syllabus.index_heads(run_id uuid,term_id uuid);
      CREATE TABLE osu_syllabus.entry_observations(run_id uuid,term_id uuid,code text,data jsonb);
      CREATE TABLE osu_syllabus.entries(code text,term_id uuid,entity_id uuid,term_code text,subject text,catalog_number text,class_number text);
      CREATE TABLE osu_syllabus.document_versions(code text,data jsonb,checked_at timestamptz,first_fetched_at timestamptz,content_hash text);
      CREATE FUNCTION osu_syllabus.official_modified(text) RETURNS timestamptz LANGUAGE sql AS 'SELECT $1::timestamptz';
    `);
      const run = randomUUID(),
        hiddenRun = randomUUID(),
        syllabusRun = randomUUID();
      await scoped.query(
        'INSERT INTO osu_catalog.sync_runs VALUES($1,\'complete\',now(),\'["1262","1264","1268","1272","1274"]\'),($2,\'complete\',now(),\'["1268"]\')',
        [run, hiddenRun],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.snapshot_versions VALUES($1,now()),($2,null)",
        [run, hiddenRun],
      );
      const jane = { displayName: "Jane Doe", email: "jane.1@osu.edu" };
      async function section(
        term,
        number,
        teacher = jane,
        { campus = "COL", subject = "ART", runId = run } = {},
      ) {
        await scoped.query(
          "INSERT INTO osu_catalog.section_snapshots VALUES($1,$2,$3,$4,'2000',$5,$6)",
          [
            runId,
            term,
            number,
            subject,
            campus,
            JSON.stringify({ meetings: [{ instructors: [teacher] }] }),
          ],
        );
      }
      await section("1272", "100");
      const termIds = new Map();
      async function candidate(
        code,
        term,
        number,
        teacher = jane,
        options = {},
      ) {
        await section(term, number, teacher, options);
        let termId = termIds.get(term);
        if (!termId) {
          termId = randomUUID();
          termIds.set(term, termId);
          await scoped.query(
            "INSERT INTO osu_syllabus.index_heads VALUES($1,$2)",
            [syllabusRun, termId],
          );
        }
        const entityId = randomUUID(),
          cls = options.alias ? "" : number;
        const entry = {
          code,
          termId,
          entityId,
          termCode: term,
          termName: term,
          title: code,
          subtitle: "",
          subject: options.subject ?? "ART",
          catalogNumber: "2000",
          classNumber: cls,
          sectionIdentifier: options.alias ? "S_" + number : number,
          visibility: "public",
          hasUploads: false,
        };
        await scoped.query(
          "INSERT INTO osu_syllabus.entries VALUES($1,$2,$3,$4,$5,'2000',$6)",
          [code, termId, entityId, term, entry.subject, cls],
        );
        await scoped.query(
          "INSERT INTO osu_syllabus.entry_observations VALUES($1,$2,$3,$4)",
          [syllabusRun, termId, code, JSON.stringify(entry)],
        );
        const doc = {
          entry: options.mismatch
            ? { ...entry, entityId: randomUUID() }
            : entry,
          modifiedAt: "2026-01-01T00:00:00Z",
          components: options.empty ? [] : [{ html: "<p>Published</p>" }],
        };
        await scoped.query(
          "INSERT INTO osu_syllabus.document_versions VALUES($1,$2,now(),now(),'hash')",
          [code, JSON.stringify(doc)],
        );
      }
      await candidate("courseonly", "1268", "200", {
        displayName: "Other Teacher",
        email: "other.2@osu.edu",
      });
      await candidate("matching", "1264", "300");
      await candidate("oldermatch", "1262", "400");
      await candidate("wrongcampus", "1268", "500", jane, { campus: "NWK" });
      await candidate("wrongcourse", "1268", "600", jane, { subject: "CSE" });
      await candidate("futureterm", "1274", "700");
      await candidate("unpublished", "1268", "800", jane, { runId: hiddenRun });
      await candidate("unreadable", "1268", "900", jane, { empty: true });
      await candidate(
        "aliasmatch",
        "1268",
        "1000",
        { ...jane, email: "JANE.1@OSU.EDU" },
        { alias: true },
      );
      await candidate("samename", "1268", "1100", {
        displayName: "Jane Doe",
        email: "someone.3@osu.edu",
      });
      await candidate("mismatched", "1268", "1200", jane, { mismatch: true });
      global.osuEvaluationPool = scoped;
      const query = {
        subject: "ART",
        catalogNumber: "2000",
        termCode: "1272",
        campusCode: "COL",
        classNumber: "100",
      };
      const result = await syllabusHistoricalReferences(query);
      assert.deepEqual(
        result.data.map((row) => row.entry.code),
        ["aliasmatch", "matching", "oldermatch", "samename", "courseonly"],
      );
      assert.deepEqual(
        result.data.map((row) => row.sameInstructor),
        [true, true, true, false, false],
      );
      assert.equal(result.source, "backup");
      assert.equal(JSON.stringify(result).includes("@"), false);
      const other = await syllabusHistoricalReferences({
        ...query,
        classNumber: "999",
      });
      assert.ok(other.data.every((row) => !row.sameInstructor));
    } finally {
      global.osuEvaluationPool = previous;
      assert.match(schema, /^syllabus_history_test_[a-f0-9]+$/);
      await db
        .query(
          `DROP SCHEMA IF EXISTS ${schema} CASCADE; DROP SCHEMA IF EXISTS ${catalog} CASCADE`,
        )
        .catch(() => {});
      await db.end();
    }
  },
);

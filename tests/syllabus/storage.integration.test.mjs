import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { loadCatalogEnvironment } from "../../scripts/catalog/database.mjs";
import {
  saveDocument,
  savePage,
  saveTerms,
  extendRunTerms,
  termIsAvailableForSync,
} from "../../scripts/syllabus/store.mjs";
import { parseSyncOptions } from "../../scripts/syllabus/sync.mjs";
import {
  normalizeDocument,
  normalizeEntry,
} from "../../src/lib/syllabus/normalize.ts";
import {
  syllabusBackupDocument,
  syllabusBackupEntries,
} from "../../src/lib/syllabus/repository.ts";
import { documentFixture, rawEntry, term } from "./fixtures.mjs";

test("sync options require bounded, explicit refresh controls", () => {
  assert.equal(parseSyncOptions([]).delayMs, 350);
  assert.equal(parseSyncOptions(["--max-documents", "20"]).maxDocuments, 20);
  assert.throws(() => parseSyncOptions(["--delay-ms", "0"]));
  assert.throws(() => parseSyncOptions(["--unknown"]));
});

test(
  "archives versions, resumes pages atomically, preserves failed publications and serves backup",
  { skip: process.env.SYLLABUS_DATABASE_TEST !== "1", timeout: 30_000 },
  async () => {
    loadCatalogEnvironment();
    const schema = `syllabus_test_${randomUUID().replaceAll("-", "")}`;
    const catalogSchema = `${schema}_catalog`;
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      statement_timeout: 5000,
    });
    const scoped = {
      query: (sql, values) =>
        client.query(
          sql
            .replaceAll("osu_syllabus", schema)
            .replaceAll("osu_catalog", catalogSchema),
          values,
        ),
    };
    const previousPool = global.osuEvaluationPool;
    try {
      await client.connect();
      await scoped.query(
        await readFile(
          new URL(
            "../../db/migrations/syllabus/001-syllabus.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await scoped.query(
        await readFile(
          new URL(
            "../../db/migrations/syllabus/003-permanent-archive.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await scoped.query(
        await readFile(
          new URL(
            "../../db/migrations/syllabus/004-canonical-archives.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await saveTerms(scoped, [term]);
      await saveTerms(scoped, [
        { ...term, published: false, status: "historic" },
      ]);
      assert.equal(
        (await scoped.query("SELECT ever_published FROM osu_syllabus.terms"))
          .rows[0].ever_published,
        true,
      );
      const run = randomUUID(),
        entry = normalizeEntry(rawEntry);
      await scoped.query(
        "INSERT INTO osu_syllabus.sync_runs(id,status,terms) VALUES($1,'running',$2)",
        [run, JSON.stringify([term])],
      );
      await scoped.query(
        "INSERT INTO osu_syllabus.sync_partitions(run_id,term_id) VALUES($1,$2)",
        [run, term.id],
      );
      await savePage(scoped, run, term, 0, {
        entries: [entry],
        total: 2,
        pageSize: 1,
        hasMore: true,
      });
      assert.equal(
        (
          await scoped.query(
            "SELECT count(*)::int AS count FROM osu_syllabus.entries",
          )
        ).rows[0].count,
        0,
      );
      await assert.rejects(
        savePage(scoped, run, term, 1, {
          entries: [entry],
          total: 2,
          pageSize: 1,
          hasMore: false,
        }),
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT next_page FROM osu_syllabus.sync_partitions",
          )
        ).rows[0].next_page,
        1,
      );
      const second = {
        ...entry,
        code: "example456",
        entityId: randomUUID(),
        classNumber: "",
        sectionIdentifier: "s_25478",
      };
      await savePage(scoped, run, term, 1, {
        entries: [second],
        total: 2,
        pageSize: 1,
        hasMore: false,
      });
      assert.equal(
        (
          await scoped.query(
            "SELECT count(*)::int AS count FROM osu_syllabus.entries",
          )
        ).rows[0].count,
        2,
      );
      await client.query(`CREATE SCHEMA ${catalogSchema}`);
      await scoped.query(`CREATE TABLE osu_catalog.sync_runs(id uuid PRIMARY KEY,terms jsonb,status text);
        CREATE TABLE osu_catalog.snapshot_versions(run_id uuid PRIMARY KEY,published_at timestamptz);
        CREATE TABLE osu_catalog.section_snapshots(last_seen_run uuid,term_code text,class_number text,course_id text,offering_number text,campus_code text,subject text,catalog_number text)`);
      const catalogRun = randomUUID();
      await scoped.query(
        "INSERT INTO osu_catalog.sync_runs VALUES($1,'[\"1268\"]','complete')",
        [catalogRun],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.snapshot_versions VALUES($1,now())",
        [catalogRun],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.section_snapshots VALUES($1,'1268','15115','1','1','COL','ART','2000'),($1,'1268','25478','1','1','COL','ART','2000'),($1,'1272','25478','1','1','COL','ART','2000')",
        [catalogRun],
      );
      await scoped.query(
        await readFile(
          new URL(
            "../../db/migrations/syllabus/002-catalog-links.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const links = (
        await scoped.query(
          "SELECT class_number,match_method FROM osu_syllabus.catalog_links ORDER BY class_number",
        )
      ).rows;
      assert.deepEqual(links, [
        { class_number: "15115", match_method: "class_number" },
        { class_number: "25478", match_method: "verified_import_alias" },
      ]);
      const document = normalizeDocument(documentFixture(), "example123");
      await saveDocument(scoped, document);
      await saveDocument(scoped, document);
      assert.equal(
        (
          await scoped.query(
            "SELECT count(*)::int AS count FROM osu_syllabus.document_versions",
          )
        ).rows[0].count,
        1,
      );
      const changed = structuredClone(document);
      changed.components[0].html += "<p>Updated grading policy</p>";
      await saveDocument(scoped, changed);
      await saveDocument(scoped, document); // rechecking an old version must not promote it

      await assert.rejects(
        scoped.query("DELETE FROM osu_syllabus.document_versions"),
        /PERMANENT_ARCHIVE/,
      );
      await assert.rejects(
        scoped.query("UPDATE osu_syllabus.document_versions SET data='{}'"),
        /PERMANENT_ARCHIVE/,
      );
      await assert.rejects(
        scoped.query("UPDATE osu_syllabus.entry_observations SET data='{}'"),
        /PERMANENT_ARCHIVE/,
      );
      await assert.rejects(
        scoped.query("TRUNCATE osu_syllabus.document_versions"),
        /PERMANENT_ARCHIVE/,
      );
      await assert.rejects(
        scoped.query("DELETE FROM osu_syllabus.entries"),
        /PERMANENT_ARCHIVE/,
      );
      await assert.rejects(
        scoped.query("DELETE FROM osu_syllabus.entry_observations"),
        /PERMANENT_ARCHIVE/,
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT count(*)::int AS count FROM osu_syllabus.document_versions",
          )
        ).rows[0].count,
        2,
      );
      await assert.rejects(
        saveDocument(scoped, {
          ...document,
          entry: { ...entry, classNumber: "99999" },
        }),
      );
      global.osuEvaluationPool = scoped;
      const backup = await syllabusBackupDocument("example123");
      assert.equal(backup.source, "backup");
      assert.match(backup.data.components[0].html, /Updated grading/);
      assert.equal(
        (
          await syllabusBackupEntries({
            subject: "ART",
            catalogNumber: "2000",
            termCode: "1268",
          })
        ).data.length,
        2,
      );
      assert.equal(
        await syllabusBackupEntries({
          subject: "ART",
          catalogNumber: "2000",
          termCode: "1272",
        }),
        null,
      );
      const replacement = randomUUID();
      await scoped.query(
        "INSERT INTO osu_syllabus.sync_runs(id,status,terms) VALUES($1,'running',$2)",
        [replacement, JSON.stringify([term])],
      );
      await scoped.query(
        "INSERT INTO osu_syllabus.sync_partitions(run_id,term_id) VALUES($1,$2)",
        [replacement, term.id],
      );
      await savePage(scoped, replacement, term, 0, {
        entries: [second],
        total: 1,
        pageSize: 1,
        hasMore: false,
      });
      assert.equal(
        (
          await syllabusBackupEntries({
            subject: "ART",
            catalogNumber: "2000",
            termCode: "1268",
          })
        ).data.length,
        1,
        "removed entry stays out of the latest complete index",
      );
      assert.equal(
        (await scoped.query("SELECT count(*)::int n FROM osu_syllabus.entries"))
          .rows[0].n,
        2,
        "removed source entry remains archived",
      );
      assert(
        (await syllabusBackupDocument("example123")).data,
        "saved document still readable after removal from the latest index",
      );
      const empty = randomUUID();
      await scoped.query(
        "INSERT INTO osu_syllabus.sync_runs(id,status,terms) VALUES($1,'running',$2)",
        [empty, JSON.stringify([term])],
      );
      await scoped.query(
        "INSERT INTO osu_syllabus.sync_partitions(run_id,term_id) VALUES($1,$2)",
        [empty, term.id],
      );
      await assert.rejects(
        savePage(scoped, empty, term, 0, {
          entries: [],
          total: 0,
          pageSize: 1,
          hasMore: false,
        }),
        /Empty replacement/,
      );
      const future = {
        ...term,
        id: randomUUID(),
        code: "1272",
        name: "Spring 2027",
        published: true,
      };
      await saveTerms(scoped, [future]);
      assert.equal(
        (
          await scoped.query(
            "SELECT source_status FROM osu_syllabus.term_archives WHERE term_id=$1",
            [term.id],
          )
        ).rows[0].source_status,
        "not-listed",
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT run_id FROM osu_syllabus.index_heads WHERE term_id=$1",
            [term.id],
          )
        ).rows[0].run_id,
        replacement,
      );
      assert.equal(termIsAvailableForSync(term, [future]), false);
      const extended = await extendRunTerms(
        scoped,
        { id: replacement, terms: [term] },
        [future],
      );
      assert.deepEqual(
        extended.terms.map((t) => t.id),
        [term.id, future.id],
        "new term joins an old document checkpoint immediately",
      );
      await saveTerms(scoped, [term, future]);
      assert.equal(
        termIsAvailableForSync(term, [term, future]),
        true,
        "returned old term is eligible again",
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT source_status FROM osu_syllabus.term_archives WHERE term_id=$1",
            [term.id],
          )
        ).rows[0].source_status,
        "listed",
      );
    } finally {
      global.osuEvaluationPool = previousPool;
      await client
        .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => {});
      await client
        .query(`DROP SCHEMA IF EXISTS ${catalogSchema} CASCADE`)
        .catch(() => {});
      await client.end();
    }
  },
);

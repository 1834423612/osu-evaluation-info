import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  prepareSearchGeneration,
  prepareSearchArtifacts,
} from "../../scripts/search/prepare.mjs";
import { loadPreparedCorpus } from "../../src/lib/search/prepared-corpus.ts";
test(
  "prepared search migration, bytea restoration, repair and retention in isolated PostgreSQL",
  { skip: !process.env.PGLITE_MODULE },
  async () => {
    const { PGlite } = await import(process.env.PGLITE_MODULE);
    const db = new PGlite();
    try {
      await db.exec(`CREATE SCHEMA osu_catalog;
      CREATE TABLE osu_catalog.sync_runs(id uuid PRIMARY KEY,status text,completed_at timestamptz,terms jsonb);
      CREATE TABLE osu_catalog.snapshot_versions(run_id uuid PRIMARY KEY,published_at timestamptz);
      CREATE TABLE osu_catalog.term_archives(term_code text,label text,source_status text,completed_at timestamptz);
      CREATE TABLE osu_catalog.course_snapshots(last_seen_run uuid,term_code text,subject text,catalog_number text,campus_code text,course_id text,offering_number text,data jsonb);
      CREATE TABLE osu_catalog.section_snapshots(last_seen_run uuid,term_code text,subject text,catalog_number text,campus_code text,course_id text,class_number text,data jsonb);`);
      await db.exec(
        await readFile(
          new URL(
            "../../db/migrations/catalog/006-search-artifacts.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const snapshot = {
        run: "12345678-1234-1234-1234-123456789012",
        term: "1272",
        snapshotAt: "2026-11-16T00:00:00.000Z",
        terms: [{ code: "1272", label: "Spring 2027" }],
      };
      await db.query(
        "INSERT INTO osu_catalog.sync_runs VALUES($1,'complete',now(),'[\"1272\"]')",
        [snapshot.run],
      );
      await db.query(
        "INSERT INTO osu_catalog.snapshot_versions VALUES($1,NULL)",
        [snapshot.run],
      );
      await db.exec(
        "INSERT INTO osu_catalog.term_archives VALUES('1272','Spring 2027','listed',now())",
      );
      await db.query(
        "INSERT INTO osu_catalog.course_snapshots VALUES($1,'1272','CSE','2221','COL','1','1',$2)",
        [
          snapshot.run,
          JSON.stringify({
            subject: "CSE",
            subjectDesc: "Computer Science",
            catalogNumber: "2221",
            campusCode: "COL",
            courseId: "1",
            offeringNumber: "1",
            title: "Software Components",
            description: "Data structures",
          }),
        ],
      );
      await db.query(
        "INSERT INTO osu_catalog.section_snapshots VALUES($1,'1272','CSE','2221','COL','1','100',$2)",
        [
          snapshot.run,
          JSON.stringify({
            classNumber: "100",
            termCode: "1272",
            courseId: "1",
            courseOfferingNumber: 1,
            section: "001",
            meetings: [],
            attributes: [],
          }),
        ],
      );
      await prepareSearchGeneration(db, snapshot);
      assert.equal(
        (
          await db.query(
            "SELECT published_at FROM osu_catalog.snapshot_versions",
          )
        ).rows[0].published_at,
        null,
      );
      await db.query(
        "UPDATE osu_catalog.snapshot_versions SET published_at=now()",
      );
      const restored = await loadPreparedCorpus(db, snapshot);
      assert.equal(restored.engine.search("software").hits.length, 1);
      await db.query("UPDATE osu_catalog.search_artifacts SET digest=$1", [
        "0".repeat(64),
      ]);
      assert.equal(await loadPreparedCorpus(db, snapshot), null);
      assert.deepEqual(await prepareSearchArtifacts(db), {
        built: 1,
        reused: 0,
      });
      assert.equal(
        (await loadPreparedCorpus(db, snapshot)).engine.search("software").hits
          .length,
        1,
      );
      // Later failed/staged artifacts must not evict the active publication.
      for (let i = 1; i <= 3; i++) {
        const run = "12345678-1234-1234-1234-" + String(i).padStart(12, "0");
        await db.query(
          "INSERT INTO osu_catalog.sync_runs VALUES($1,'failed',now(),'[\"1272\"]')",
          [run],
        );
        await db.query(
          "INSERT INTO osu_catalog.search_artifacts SELECT $1,term_code,format_version,payload,digest,now()+interval '1 day' FROM osu_catalog.search_artifacts WHERE run_id=$2",
          [run, snapshot.run],
        );
      }
      assert.deepEqual(await prepareSearchArtifacts(db), {
        built: 0,
        reused: 1,
      });
      assert.ok(await loadPreparedCorpus(db, snapshot));
    } finally {
      await db.close();
    }
  },
);

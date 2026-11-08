import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import pg from "pg";
import { loadCatalogEnvironment } from "../../scripts/catalog/database.mjs";
import { pruneCatalogSnapshots } from "../../scripts/catalog/prune_snapshots.mjs";
import { publishCatalogSnapshot } from "../../scripts/catalog/snapshots.mjs";
import { FIND_CATALOG_SNAPSHOT_SQL } from "../../src/lib/catalog/snapshot-policy.ts";

it(
  "isolates staged generations, publishes atomically, preserves old cursors, and rolls back incomplete publication",
  { skip: process.env.CATALOG_DATABASE_TEST !== "1", timeout: 60000 },
  async () => {
    loadCatalogEnvironment();
    const schema = `catalog_test_${randomUUID().replaceAll("-", "")}`;
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      application_name: "osu-catalog-integration",
      statement_timeout: 5000,
      lock_timeout: 1000,
    });
    const reader = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      application_name: "osu-catalog-integration-reader",
      statement_timeout: 5000,
      lock_timeout: 1000,
    });
    const scoped = {
      query(sql, values) {
        return client.query(sql.replaceAll("osu_catalog", schema), values);
      },
    };
    let created = false;
    try {
      await Promise.all([client.connect(), reader.connect()]);
      await client.query(`CREATE SCHEMA ${schema}`);
      created = true;
      const initial = await readFile(
        new URL("../../db/schemas/catalog.sql", import.meta.url),
        "utf8",
      );
      await scoped.query(initial);
      const old = randomUUID(),
        next = randomUUID(),
        broken = randomUUID();
      await scoped.query(
        "INSERT INTO osu_catalog.sync_runs(id,status,terms,completed_at,expected_sections,distinct_sections) VALUES($1,'complete','[\"1272\"]',now()-interval '1 day',1,1)",
        [old],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.courses VALUES('1272','1','1','COL','MATH','1151','Calculus','', '{}'::jsonb,now(),$1)",
        [old],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.sections VALUES('1272','1','1','1','COL','MATH','1151','{}'::jsonb,now(),$1)",
        [old],
      );
      await scoped.query(
        await readFile(
          new URL(
            "../../db/migrations/catalog/002-versioned-snapshots.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const find = async (connection, pinned = null) =>
        (
          await connection.query(
            FIND_CATALOG_SNAPSHOT_SQL.replaceAll("osu_catalog", schema),
            ["1272", pinned],
          )
        ).rows[0]?.id;
      assert.equal(
        await find(client),
        old,
        "migration bootstraps the completed legacy version",
      );
      for (const run of [next, broken]) {
        await scoped.query(
          "INSERT INTO osu_catalog.sync_runs(id,status,terms,expected_sections) VALUES($1,'running','[\"1272\"]',1)",
          [run],
        );
        await scoped.query(
          "INSERT INTO osu_catalog.snapshot_versions(run_id) VALUES($1)",
          [run],
        );
        await scoped.query(
          "INSERT INTO osu_catalog.sync_partitions(run_id,partition_key,query,expected_sections,fetched_sections,complete) VALUES($1,'page','{}',1,1,true)",
          [run],
        );
      }
      assert.equal(
        await find(client),
        old,
        "running generations cannot hide the old publication",
      );
      await scoped.query(
        "UPDATE osu_catalog.sync_runs SET status='failed' WHERE id=$1",
        [broken],
      );
      assert.equal(
        await find(client),
        old,
        "failed generations cannot hide the old publication",
      );
      await scoped.query(
        "INSERT INTO osu_catalog.course_snapshots SELECT term_code,course_id,offering_number,campus_code,subject,catalog_number,title,description,data,now(),$2 FROM osu_catalog.course_snapshots WHERE last_seen_run=$1",
        [old, next],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.section_snapshots SELECT term_code,class_number,course_id,offering_number,campus_code,subject,catalog_number,data,now(),$2 FROM osu_catalog.section_snapshots WHERE last_seen_run=$1",
        [old, next],
      );
      await reader.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      assert.equal(await find(reader), old);
      await publishCatalogSnapshot(scoped, next, 1, 1);
      assert.equal(
        await find(reader),
        old,
        "an existing read transaction stays consistent",
      );
      await reader.query("COMMIT");
      assert.equal(
        await find(client),
        next,
        "the new generation is visible after commit",
      );
      assert.equal(
        await find(client, old),
        old,
        "old cursor generations remain readable",
      );
      await scoped.query(
        "UPDATE osu_catalog.sync_runs SET status='running' WHERE id=$1",
        [broken],
      );
      await assert.rejects(
        publishCatalogSnapshot(scoped, broken, 1, 1),
        /publication rejected/,
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT status FROM osu_catalog.sync_runs WHERE id=$1",
            [broken],
          )
        ).rows[0].status,
        "running",
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT published_at FROM osu_catalog.snapshot_versions WHERE run_id=$1",
            [broken],
          )
        ).rows[0].published_at,
        null,
      );
      await scoped.query(
        "INSERT INTO osu_catalog.section_snapshots VALUES('1272','999','missing','1','COL','MATH','1151','{}',now(),$1)",
        [broken],
      );
      await assert.rejects(
        publishCatalogSnapshot(scoped, broken, 1, 1),
        /publication rejected/,
      );
      assert.equal(await find(client), next);
      await scoped.query(
        "UPDATE osu_catalog.section_snapshots SET course_id='1',campus_code='MNS' WHERE last_seen_run=$1",
        [broken],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.course_snapshots SELECT term_code,course_id,offering_number,campus_code,subject,catalog_number,title,description,data,now(),$2 FROM osu_catalog.course_snapshots WHERE last_seen_run=$1",
        [old, broken],
      );
      await assert.rejects(
        publishCatalogSnapshot(scoped, broken, 1, 1),
        /publication rejected/,
        "a parent in another campus is insufficient",
      );
      await scoped.query(
        "UPDATE osu_catalog.section_snapshots SET campus_code='COL',subject='PHYSICS' WHERE last_seen_run=$1",
        [broken],
      );
      await assert.rejects(
        publishCatalogSnapshot(scoped, broken, 1, 1),
        /publication rejected/,
        "subject identity must also agree",
      );
      await assert.rejects(
        publishCatalogSnapshot(scoped, broken, 1, 0),
        /publication rejected/,
        "an empty generation cannot publish",
      );
      assert.equal(await find(client), next);
      const kept = await pruneCatalogSnapshots(scoped);
      assert.equal(
        kept.deletedRows,
        0,
        "default age and version limits protect existing cursors",
      );
      const pruned = await pruneCatalogSnapshots(scoped, {
        keep: 1,
        minAgeHours: 0,
        batchSize: 1,
        wait: async () => {},
      });
      assert.equal(pruned.runId, old);
      assert.equal(pruned.deletedRows, 2);
      assert.equal(pruned.complete, true);
      assert.equal(await find(client, old), undefined);
      assert.equal(await find(client), next);
      assert.equal(
        (
          await scoped.query(
            "SELECT count(*)::int AS n FROM osu_catalog.sections",
          )
        ).rows[0].n,
        1,
        "legacy rows remain unchanged",
      );
      await scoped.query(
        "UPDATE osu_catalog.sync_runs SET status='failed',error='CATALOG_CHECKPOINT_INVALID: fixture',started_at=now()-interval '2 days',terms='[\"1272\",\"1282\"]' WHERE id=$1",
        [broken],
      );
      assert.equal(
        (await pruneCatalogSnapshots(scoped)).deletedRows,
        0,
        "failed generations wait until all their terms have newer publications",
      );
      await scoped.query(
        "UPDATE osu_catalog.sync_runs SET terms='[\"1272\"]' WHERE id=$1",
        [broken],
      );
      const partialCleanup = await pruneCatalogSnapshots(scoped, {
        budgetMs: 0,
      });
      assert.equal(partialCleanup.runId, broken);
      assert.equal(partialCleanup.complete, false);
      const abandoned = await pruneCatalogSnapshots(scoped, {
        batchSize: 1,
        wait: async () => {},
      });
      assert.equal(abandoned.runId, broken);
      assert.equal(abandoned.deletedRows, 2);
      assert.equal(abandoned.complete, true);
      assert.equal(await find(client), next);
      assert.equal(
        (
          await scoped.query(
            "SELECT status FROM osu_catalog.sync_runs WHERE id=$1",
            [broken],
          )
        ).rows[0].status,
        "failed",
        "failed-run audit history is retained",
      );
      const transient = randomUUID();
      await scoped.query(
        "INSERT INTO osu_catalog.sync_runs(id,status,terms,started_at,error) VALUES($1,'failed','[\"1272\"]',now()-interval '2 days','CATALOG_HTTP_ERROR: temporary')",
        [transient],
      );
      await scoped.query(
        "INSERT INTO osu_catalog.snapshot_versions(run_id) VALUES($1)",
        [transient],
      );
      assert.equal(
        (await pruneCatalogSnapshots(scoped)).deletedRows,
        0,
        "transient/resumable failures are never reclaimed automatically",
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT count(*)::int AS n FROM osu_catalog.snapshot_versions WHERE run_id=$1",
            [transient],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await reader.query("ROLLBACK").catch(() => {});
      if (created) await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await Promise.allSettled([client.end(), reader.end()]);
    }
  },
);

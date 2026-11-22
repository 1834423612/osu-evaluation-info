import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { publishCatalogSnapshot } from "../../scripts/catalog/snapshots.mjs";
import {
  FIND_CATALOG_SNAPSHOT_SQL,
  acceptedCatalogRunSql,
} from "../../src/lib/catalog/snapshot-policy.ts";
import { quarantinePublishedCatalog } from "../../scripts/catalog/recover_snapshot.mjs";

test("publication rejects official coverage collapse and preserves searchable immutable backups", async () => {
  const db = new PGlite();
  const directory = await mkdtemp(join(tmpdir(), "osu-coverage-test-"));
  try {
    await db.exec(
      await readFile(
        new URL("../../db/schemas/catalog.sql", import.meta.url),
        "utf8",
      ),
    );
    const folder = new URL("../../db/migrations/catalog/", import.meta.url);
    for (const file of (await readdir(folder))
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort())
      await db.exec(await readFile(new URL(file, folder), "utf8"));
    async function stage(groups, term = "1272") {
      const run = randomUUID(),
        count = groups.reduce((n, group) => n + group[2], 0);
      await db.query(
        "INSERT INTO osu_catalog.sync_runs(id,status,terms,expected_sections) VALUES($1,'running',$2,$3)",
        [run, JSON.stringify([term]), count],
      );
      await db.query(
        "INSERT INTO osu_catalog.snapshot_versions(run_id) VALUES($1)",
        [run],
      );
      await db.query(
        "INSERT INTO osu_catalog.sync_partitions(run_id,partition_key,query,expected_sections,fetched_sections,complete) VALUES($1,'fixture','{}',$2,$2,true)",
        [run, count],
      );
      for (const [campus, subject, size] of groups) {
        if (!size) continue;
        const courseId = String(
          groups.findIndex((g) => g[0] === campus && g[1] === subject) + 1,
        );
        await db.query(
          "INSERT INTO osu_catalog.course_snapshots VALUES($1,$2,'1',$3,$4,'1100','Introduction','','{}',now(),$5)",
          [term, courseId, campus, subject, run],
        );
        await db.query(
          "INSERT INTO osu_catalog.section_snapshots SELECT $1,($2::int*1000+n)::text,$2,'1',$3,$4,'1100','{}',now(),$5 FROM generate_series(1,$6::int) n",
          [term, courseId, campus, subject, run, size],
        );
      }
      return { run, count };
    }
    const publish = (value) =>
      publishCatalogSnapshot(db, value.run, value.count, value.count);
    const head = async (term) =>
      (await db.query(FIND_CATALOG_SNAPSHOT_SQL, [term, null])).rows[0]?.id;
    const good = await stage([
      ["COL", "PSYCH", 60],
      ["MNS", "PSYCH", 40],
      ["COL", "MATH", 60],
    ]);
    await publish(good);
    assert.equal(await head("1272"), good.run);
    const collapsed = await stage([
      ["COL", "PSYCH", 25],
      ["COL", "MATH", 60],
    ]);
    await assert.rejects(publish(collapsed), /CATALOG_COVERAGE_REGRESSION/);
    assert.equal(await head("1272"), good.run);
    assert.equal(
      (
        await db.query("SELECT status FROM osu_catalog.sync_runs WHERE id=$1", [
          collapsed.run,
        ])
      ).rows[0].status,
      "running",
    );
    assert.equal(
      (
        await db.query(
          "SELECT published_at FROM osu_catalog.snapshot_versions WHERE run_id=$1",
          [collapsed.run],
        )
      ).rows[0].published_at,
      null,
    );
    // Equal totals must not hide a single subject/campus disappearing.
    const replaced = await stage([
      ["COL", "PSYCH", 20],
      ["MNS", "PSYCH", 40],
      ["COL", "MATH", 100],
    ]);
    await assert.rejects(publish(replaced), /CATALOG_COVERAGE_REGRESSION/);
    const normal = await stage([
      ["COL", "PSYCH", 58],
      ["MNS", "PSYCH", 39],
      ["COL", "MATH", 59],
    ]);
    await publish(normal);
    assert.equal(await head("1272"), normal.run);
    const newTerm = await stage([["COL", "PSYCH", 2]], "1274");
    await publish(newTerm);
    assert.equal(await head("1274"), newTerm.run);
    // Simulate a degraded publication made before migration 7 was installed.
    const legacy = await stage([
      ["COL", "PSYCH", 25],
      ["COL", "MATH", 20],
    ]);
    await db.exec(
      "ALTER TABLE osu_catalog.snapshot_versions DISABLE TRIGGER catalog_publication_coverage",
    );
    await publish(legacy);
    await db.exec(
      "ALTER TABLE osu_catalog.snapshot_versions ENABLE TRIGGER catalog_publication_coverage",
    );
    const planned = await quarantinePublishedCatalog(db, legacy.run);
    assert.equal(planned.apply, false);
    assert.equal(await head("1272"), legacy.run);
    await assert.rejects(
      quarantinePublishedCatalog(db, legacy.run, { apply: true }),
      /backup/,
    );
    const backup = join(directory, "recovery.json");
    await quarantinePublishedCatalog(db, legacy.run, { apply: true, backup });
    assert.equal(
      JSON.parse(await readFile(backup, "utf8")).target.id,
      legacy.run,
    );
    assert.equal(await head("1272"), normal.run);
    await assert.rejects(quarantinePublishedCatalog(db, normal.run), /healthy/);
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int n FROM osu_catalog.change_batches b WHERE b.run_id=$1 AND ${acceptedCatalogRunSql("b.run_id")}`,
          [legacy.run],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int n FROM osu_catalog.course_changes e WHERE e.run_id=$1 AND ${acceptedCatalogRunSql("e.run_id")}`,
          [legacy.run],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int n FROM osu_catalog.change_batches b WHERE b.run_id=$1 AND ${acceptedCatalogRunSql("b.run_id")}`,
          [normal.run],
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(
      db.query(
        "UPDATE osu_catalog.section_snapshots SET data='{}' WHERE last_seen_run=$1",
        [legacy.run],
      ),
      /PERMANENT_ARCHIVE/,
    );
    await assert.rejects(
      db.query(
        "DELETE FROM osu_catalog.course_snapshots WHERE last_seen_run=$1",
        [legacy.run],
      ),
      /PERMANENT_ARCHIVE/,
    );
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

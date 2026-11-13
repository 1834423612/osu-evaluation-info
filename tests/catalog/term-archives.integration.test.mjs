import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { publishCatalogSnapshot } from "../../scripts/catalog/snapshots.mjs";
import {
  FIND_CATALOG_SNAPSHOT_SQL,
  FIND_COURSE_ARCHIVE_SQL,
  LIST_CATALOG_TERMS_SQL,
  LATEST_CATALOG_TERM_SQL,
} from "../../src/lib/catalog/snapshot-policy.ts";
test(
  "term rollover preserves one complete archive head while current corrections keep updating",
  { skip: process.env.CATALOG_DATABASE_TEST !== "1", timeout: 30000 },
  async () => {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const schema = "catalog_archive_test_" + randomUUID().replaceAll("-", "");
    const scoped = {
      query: (sql, values) =>
        c.query(sql.replaceAll("osu_catalog", schema), values),
    };
    try {
      for (const file of [
        "db/schemas/catalog.sql",
        "db/migrations/catalog/002-versioned-snapshots.sql",
        "db/migrations/catalog/003-permanent-archive.sql",
        "db/migrations/catalog/004-term-archives.sql",
      ])
        await scoped.query(
          await readFile(new URL("../../" + file, import.meta.url), "utf8"),
        );
      async function stage(terms, rows) {
        const id = randomUUID();
        await scoped.query(
          "INSERT INTO osu_catalog.sync_runs(id,status,terms,expected_sections) VALUES($1,'running',$2,$3)",
          [id, JSON.stringify(terms), rows.length],
        );
        await scoped.query(
          "INSERT INTO osu_catalog.snapshot_versions(run_id) VALUES($1)",
          [id],
        );
        await scoped.query(
          "INSERT INTO osu_catalog.sync_partitions(run_id,partition_key,query,complete,expected_sections,fetched_sections) VALUES($1,'fixture','{}',true,$2,$2)",
          [id, rows.length],
        );
        for (const [term, num, title] of rows) {
          await scoped.query(
            "INSERT INTO osu_catalog.course_snapshots VALUES($1,$2,'1','COL','MATH',$2,$3,'',$4,now(),$5)",
            [
              term,
              num,
              title,
              JSON.stringify({
                term,
                courseId: num,
                subject: "MATH",
                catalogNumber: num,
                title,
              }),
              id,
            ],
          );
          await scoped.query(
            "INSERT INTO osu_catalog.section_snapshots VALUES($1,$2,$2,'1','COL','MATH',$2,'{}',now(),$3)",
            [term, num, id],
          );
        }
        return id;
      }
      const old = await stage(
        ["1268", "1272"],
        [
          ["1268", "1100", "Autumn complete"],
          ["1272", "1151", "Old title"],
          ["1272", "9999", "Erroneous course"],
        ],
      );
      await publishCatalogSnapshot(scoped, old, 3, 3, {
        terms: ["1268", "1272"],
        checkedAt: new Date().toISOString(),
      });
      const next = await stage(
        ["1272", "1274"],
        [
          ["1272", "1151", "Corrected title"],
          ["1274", "1151", "New term"],
        ],
      );
      await publishCatalogSnapshot(scoped, next, 2, 2, {
        terms: ["1272", "1274"],
        checkedAt: new Date().toISOString(),
      });
      const rows = (await scoped.query(LIST_CATALOG_TERMS_SQL)).rows;
      assert.equal(rows.length, 3);
      assert.equal(new Set(rows.map((r) => r.code)).size, 3);
      assert.equal(
        rows.find((r) => r.code === "1268").sourceStatus,
        "not-listed",
      );
      assert.equal(
        (await scoped.query(FIND_CATALOG_SNAPSHOT_SQL, ["1268", null])).rows[0]
          .id,
        old,
      );
      assert.equal(
        (await scoped.query(FIND_CATALOG_SNAPSHOT_SQL, ["1272", null])).rows[0]
          .id,
        next,
      );
      assert.equal(
        (await scoped.query(LATEST_CATALOG_TERM_SQL)).rows[0].term_code,
        "1274",
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT title FROM osu_catalog.course_snapshots WHERE last_seen_run=$1 AND term_code='1272' AND course_id='1151'",
            [next],
          )
        ).rows[0].title,
        "Corrected title",
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT 1 FROM osu_catalog.course_snapshots WHERE last_seen_run=$1 AND course_id='9999'",
            [next],
          )
        ).rowCount,
        0,
        "removed course stays out of current catalog",
      );
      assert.equal(
        (
          await scoped.query(FIND_COURSE_ARCHIVE_SQL, [
            "1272",
            "MATH",
            "9999",
            "COL",
          ])
        ).rows[0].id,
        old,
        "saved course still resolves to a complete historical copy",
      );
      const failed = await stage(
        ["1272"],
        [["1272", "1151", "Partial invalid"]],
      );
      await assert.rejects(
        publishCatalogSnapshot(scoped, failed, 2, 1, {
          terms: ["1272"],
          checkedAt: new Date().toISOString(),
        }),
      );
      assert.equal(
        (await scoped.query(FIND_CATALOG_SNAPSHOT_SQL, ["1272", null])).rows[0]
          .id,
        next,
        "failed publication cannot replace a complete head",
      );
      const returned = await stage(
        ["1268"],
        [["1268", "1100", "Official late correction"]],
      );
      await publishCatalogSnapshot(scoped, returned, 1, 1, {
        terms: ["1268", "1272", "1274"],
        checkedAt: new Date().toISOString(),
      });
      assert.equal(
        (await scoped.query(FIND_CATALOG_SNAPSHOT_SQL, ["1268", null])).rows[0]
          .id,
        returned,
        "a returned term can update even after archival",
      );
      assert.equal(
        (
          await scoped.query(
            "SELECT source_status FROM osu_catalog.term_archives WHERE term_code='1268'",
          )
        ).rows[0].source_status,
        "listed",
      );
      await assert.rejects(
        scoped.query(
          "DELETE FROM osu_catalog.course_snapshots WHERE last_seen_run=$1",
          [old],
        ),
        /PERMANENT_ARCHIVE/,
      );
    } finally {
      await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await c.end();
    }
  },
);

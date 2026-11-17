import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { planningSchema } from "../../src/lib/planning/namespace.ts";
test("isolated embedded PostgreSQL enforces planning migration, references, approval and rollback", async () => {
  const db = new PGlite();
  const schema = planningSchema({ PLANNING_SCHEMA: "osu_planning_test" });
  try {
    const sql = (
      await readFile(
        new URL("../../db/schemas/planning.sql", import.meta.url),
        "utf8",
      )
    ).replaceAll("osu_planning", schema);
    await db.exec(sql);
    await db.exec(sql);
    await db.query(
      `INSERT INTO ${schema}.source_document VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        "synthetic",
        "https://example.osu.edu/curriculum",
        "a".repeat(64),
        "2026-01-01T00:00:00Z",
        null,
        "text/html",
      ],
    );
    const insert = `INSERT INTO ${schema}.curriculum_version (id,source_id,document_kind,program,version,evidence,curriculum,review_status) VALUES ($1,'synthetic','sample-plan','SYNTHETIC','v1','[]','[]',$2)`;
    await assert.rejects(() => db.query(insert, ["unreviewed", "approved"]));
    await db.query(insert, ["pending", "pending"]);
    await db.exec("BEGIN");
    await db.query(`DELETE FROM ${schema}.curriculum_version WHERE id=$1`, [
      "pending",
    ]);
    await db.exec("ROLLBACK");
    assert.equal(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM ${schema}.curriculum_version`,
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(() =>
      db.query(`DELETE FROM ${schema}.source_document WHERE id=$1`, [
        "synthetic",
      ]),
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN ('osu_identity','osu_planning')",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("database catalog releases retain full templates and publish atomically", async () => {
  const { publicCatalogSchema, readPublicCatalog } =
    await import("../../src/lib/planning/public-catalog.ts");
  const db = new PGlite();
  const schema = planningSchema();
  try {
    const sql = (
      await readFile(
        new URL("../../db/schemas/planning.sql", import.meta.url),
        "utf8",
      )
    ).replaceAll("osu_planning", schema);
    await db.exec(sql);
    await assert.rejects(readPublicCatalog(db), /not been published/);
    const read = async (name) =>
      JSON.parse(
        await readFile(
          new URL(`../../data/planning/${name}.json`, import.meta.url),
          "utf8",
        ),
      );
    const catalog = publicCatalogSchema.parse({
      schemaVersion: 1,
      directory: await read("directory"),
      curricula: await read("curricula"),
      subjects: (await read("subjects")).subjects,
      sources: (await read("sample-sources")).sources,
    });
    const insert = `INSERT INTO ${schema}.catalog_release(id,catalog,published_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`;
    await db.query(insert, [
      "a".repeat(64),
      JSON.stringify(catalog),
      "2026-01-01",
    ]);
    await db.query(insert, [
      "a".repeat(64),
      JSON.stringify(catalog),
      "2026-01-01",
    ]);
    const stored = await readPublicCatalog(db);
    assert.deepEqual(stored, catalog);
    await db.exec("BEGIN");
    await db.query(insert, [
      "b".repeat(64),
      JSON.stringify({ ...catalog, curricula: catalog.curricula.slice(0, 1) }),
      "2026-02-01",
    ]);
    await db.exec("ROLLBACK");
    assert.equal(
      (await readPublicCatalog(db)).curricula.length,
      catalog.curricula.length,
    );
    assert.equal(
      (await db.query(`SELECT count(*)::int n FROM ${schema}.catalog_release`))
        .rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

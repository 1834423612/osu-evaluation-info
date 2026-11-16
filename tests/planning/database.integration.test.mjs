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

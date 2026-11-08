import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { UPSERT_TRANSLATION_USAGE_SQL } from "../../src/lib/translation/usage.ts";

test(
  "PostgreSQL schema aggregates atomically, constrains dimensions and prunes old days",
  {
    skip: process.env.TRANSLATION_DATABASE_TEST !== "1",
    timeout: 15000,
  },
  async () => {
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 3000,
    });
    const schema = `translation_test_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.connect();
      await client.query("BEGIN");
      const sql = await readFile(
        new URL("../../db/schemas/translation.sql", import.meta.url),
        "utf8",
      );
      await client.query(sql.replaceAll("osu_translation", schema));
      const day = new Date().toISOString().slice(0, 10);
      const values = [
        JSON.stringify([
          {
            day,
            provider: "ollama",
            target: "en",
            outcome: "success",
            count: 2,
            characters: 100,
            durationMs: 90,
            maxDurationMs: 50,
          },
        ]),
      ];
      await client.query(
        UPSERT_TRANSLATION_USAGE_SQL.replaceAll("osu_translation", schema),
        values,
      );
      await client.query(
        UPSERT_TRANSLATION_USAGE_SQL.replaceAll("osu_translation", schema),
        values,
      );
      const saved = (await client.query(`SELECT * FROM ${schema}.daily_usage`))
        .rows[0];
      assert.equal(saved.requests, "4");
      assert.equal(saved.input_characters, "200");
      assert.equal(saved.total_duration_ms, "180");
      assert.equal(saved.max_duration_ms, 50);
      await client.query(
        `INSERT INTO ${schema}.daily_usage SELECT day - 100, provider, target, outcome, requests, input_characters, total_duration_ms, max_duration_ms FROM ${schema}.daily_usage`,
      );
      await client.query(
        `DELETE FROM ${schema}.daily_usage WHERE day < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 89`,
      );
      assert.equal(
        (await client.query(`SELECT count(*) FROM ${schema}.daily_usage`))
          .rows[0].count,
        "1",
      );
      await client.query("SAVEPOINT invalid");
      await assert.rejects(
        client.query(
          `UPDATE ${schema}.daily_usage SET provider='unbounded-user-input'`,
        ),
        { code: "23514" },
      );
      await client.query("ROLLBACK TO SAVEPOINT invalid");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  },
);

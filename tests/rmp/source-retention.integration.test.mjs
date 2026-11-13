import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
test(
  "RMP source retention preserves raw records",
  {
    skip:
      process.env.RMP_INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL,
    timeout: 30000,
  },
  async (t) => {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    try {
      await t.test(
        "retention rejects removal while preserving source updates and archived reviews",
        async () => {
          const schema = "rmp_library_test_" + randomUUID().replaceAll("-", "");
          const scoped = (sql) => sql.replaceAll("osu_rmp", schema);
          try {
            await c.query(
              `CREATE SCHEMA ${schema};CREATE TABLE ${schema}.professor(id bigint);CREATE TABLE ${schema}.professor_school(id bigint);CREATE TABLE ${schema}.review(professor_id bigint,class_name text,legacy_id bigint,active boolean);CREATE TABLE ${schema}.app_migration(version text PRIMARY KEY)`,
            );
            await c.query(
              scoped(
                await readFile(
                  new URL("../../db/schemas/rmp-library.sql", import.meta.url),
                  "utf8",
                ),
              ),
            );
            await c.query(
              `INSERT INTO ${schema}.review VALUES(1,'MATH1151',1,true)`,
            );
            for (const sql of [
              `DELETE FROM ${schema}.review`,
              `TRUNCATE ${schema}.review`,
            ])
              await assert.rejects(c.query(sql), /PERMANENT_ARCHIVE/);
            await c.query(
              `UPDATE ${schema}.review SET active=false WHERE legacy_id=1`,
            );
            assert.equal(
              (await c.query(`SELECT count(*)::int n FROM ${schema}.review`))
                .rows[0].n,
              1,
            );
          } finally {
            await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
          }
        },
      );
    } finally {
      await c.end();
    }
  },
);

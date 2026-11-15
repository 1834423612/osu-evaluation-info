import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
test(
  "auth migration refuses unowned existing tables in the configured search-path schema",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const p of [".env.local", ".env"])
      if (existsSync(p)) process.loadEnvFile(p);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const tag = randomBytes(5).toString("hex"),
      prefix = "ca_guard_" + tag + "_",
      schema = "osu_user_test_" + tag;
    process.env.AUTH_TABLE_PREFIX = prefix;
    process.env.USER_DATA_SCHEMA = schema;
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      db = getDatabasePool(),
      { createAuth } = await import("../../src/lib/auth/server.ts"),
      { getMigrations } = await import("better-auth/db/migration");
    const plan = await getMigrations(createAuth().options),
      tables = plan.toBeCreated.map((x) => x.table);
    t.after(async () => {
      try {
        for (const name of tables) {
          assert.ok(name.startsWith(prefix));
          await db.query('DROP TABLE IF EXISTS "' + name + '" CASCADE');
        }
        assert.match(schema, /^osu_user_test_[a-f0-9]+$/);
        await db.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      } finally {
        await db.end();
      }
    });
    await db.query(await plan.compileMigrations());
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["scripts/user-data/auth-migrate.mjs", "--apply"],
        { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (x) => (stdout += x));
      child.stderr.on("data", (x) => (stderr += x));
      child.on("error", reject);
      child.on("exit", (code) => resolve({ code, stdout, stderr }));
    });
    assert.notEqual(result.code, 0);
    assert.match(
      result.stderr,
      /Existing authentication tables are not owned by this installation/,
    );
    const marker = await db.query("SELECT to_regclass($1) AS marker", [
      schema + ".installation",
    ]);
    assert.equal(marker.rows[0].marker, null);
  },
);

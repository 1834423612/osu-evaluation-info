import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
test(
  "isolated account schema supports verified registration, OTP login, and one-use codes",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const file of [".env.local", ".env"])
      if (existsSync(file)) process.loadEnvFile(file);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_identity_test_" + randomBytes(5).toString("hex");
    process.env.AUTH_SCHEMA = schema;
    process.env.USER_DATA_SCHEMA = schema;
    process.env.AUTH_TABLE_PREFIX = "";
    process.env.AUTH_DEV_BASE_URL = "http://localhost:3000";
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      { getAuthPool } = await import("../../src/lib/auth/database.ts"),
      { createAuth } = await import("../../src/lib/auth/server.ts"),
      { getMigrations } = await import("better-auth/db/migration");
    const db = getDatabasePool();
    await db.query('CREATE SCHEMA "' + schema + '"');
    const pool = getAuthPool();
    t.after(async () => {
      await pool.end();
      assert.match(schema, /^osu_identity_test_[a-f0-9]+$/);
      await db.query('DROP SCHEMA "' + schema + '" CASCADE');
      await db.end();
    });
    let otp = "";
    const auth = createAuth({
      deliverCode: async (_email, code) => {
        otp = code;
      },
    });
    const plan = await getMigrations(auth.options);
    await pool.query(await plan.compileMigrations());
    const request = async (path, body) =>
      auth.handler(
        new Request("http://localhost:3000/api/auth" + path, {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    const email = "domain-test@example.invalid",
      password = "Temporary-test-password-8462";
    let r = await request("/sign-up/email", {
      email,
      password,
      name: "Domain test",
    });
    assert.equal(r.status, 200);
    assert.match(otp, /^\d{6}$/);
    r = await request("/sign-in/email", { email, password });
    assert.notEqual(r.status, 200);
    r = await request("/email-otp/verify-email", { email, otp });
    assert.equal(r.status, 200);
    r = await request("/sign-in/email", { email, password });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie") ?? "", /session_token/);
    r = await request("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    assert.equal(r.status, 200);
    r = await request("/sign-in/email-otp", { email, otp });
    assert.equal(r.status, 200);
    r = await request("/sign-in/email-otp", { email, otp });
    assert.notEqual(r.status, 200);
    const tables = (
      await db.query("SELECT tablename FROM pg_tables WHERE schemaname=$1", [
        schema,
      ])
    ).rows.map((x) => x.tablename);
    assert.ok(tables.includes("user") && tables.includes("passkey"));
    assert.ok(tables.every((x) => !x.startsWith("ca_")));
  },
);

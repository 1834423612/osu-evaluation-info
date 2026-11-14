import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
test(
  "two devices share one verified account; OTP replay, passwords, revocation and distributed limits",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const path of [".env.local", ".env"])
      if (existsSync(path)) process.loadEnvFile(path);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const suffix = randomBytes(5).toString("hex"),
      prefix = "ca_test_" + suffix + "_",
      schema = "osu_user_test_" + suffix;
    Object.assign(process.env, {
      NODE_ENV: "test",
      AUTH_DEV_BASE_URL: "http://localhost:3000",
      AUTH_TABLE_PREFIX: prefix,
      USER_DATA_SCHEMA: schema,
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      USER_DATA_SECRET: randomBytes(32).toString("hex"),
    });
    const { getMigrations } = await import("better-auth/db/migration");
    const { createAuth } = await import("../../src/lib/auth/server.ts");
    const { getDatabasePool } = await import("../../src/lib/db.ts");
    const { checkBudget } =
      await import("../../src/lib/user-data/rate-limit.ts");
    const codes = new Map(),
      auth = createAuth({
        deliverCode: async (email, code) => {
          codes.set(email, code);
        },
      }),
      db = getDatabasePool();
    const plan = await getMigrations(auth.options);
    assert.ok(plan.toBeCreated.length >= 6);
    assert.ok(plan.toBeCreated.every((x) => x.table.startsWith(prefix)));
    const tables = plan.toBeCreated.map((x) => x.table);
    t.after(async () => {
      try {
        for (const name of [...tables].reverse()) {
          assert.match(name, new RegExp("^" + prefix + "[a-z_]+$"));
          await db.query('DROP TABLE IF EXISTS "' + name + '" CASCADE');
        }
        assert.match(schema, /^osu_user_test_[a-f0-9]+$/);
        await db.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      } finally {
        await db.end();
      }
    });
    await db.query(
      readFileSync(
        "db/migrations/20261114_user_data_base.sql",
        "utf8",
      ).replaceAll("osu_user", schema),
    );
    await plan.runMigrations();
    const make = async (path, body, cookie = "") => {
      const r = await auth.handler(
        new Request("http://localhost:3000/api/auth" + path, {
          method: body ? "POST" : "GET",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
      let data;
      try {
        data = await r.json();
      } catch {
        data = null;
      }
      return {
        status: r.status,
        data,
        cookie: r.headers
          .getSetCookie()
          .map((x) => x.split(";")[0])
          .join("; "),
      };
    };
    const email = "protocol-" + suffix + "@example.invalid";
    assert.equal(
      (
        await make("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status,
      200,
    );
    const code = codes.get(email);
    assert.match(code, /^\d{6}$/);
    const stored = await db.query(
      'SELECT value FROM "' + prefix + 'verification"',
    );
    assert.ok(!stored.rows.some((x) => String(x.value).includes(code)));
    const wrong = (code[0] === "0" ? "1" : "0") + code.slice(1);
    assert.notEqual(
      (await make("/sign-in/email-otp", { email, otp: wrong })).status,
      200,
    );
    const first = await make("/sign-in/email-otp", {
      email,
      otp: code,
      name: "Protocol test",
    });
    assert.equal(first.status, 200);
    assert.equal(first.data.user.emailVerified, true);
    assert.notEqual(
      (await make("/sign-in/email-otp", { email, otp: code })).status,
      200,
    );
    assert.equal(
      (
        await make("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status,
      200,
    );
    const second = await make("/sign-in/email-otp", {
      email,
      otp: codes.get(email),
    });
    assert.equal(second.status, 200);
    assert.equal(second.data.user.id, first.data.user.id);
    assert.notEqual(second.data.token, first.data.token);
    const options = await make(
      "/passkey/generate-register-options",
      null,
      first.cookie,
    );
    assert.equal(options.status, 200);
    assert.equal(options.data.rp.id, "localhost");
    assert.ok(!options.data.authenticatorSelection.authenticatorAttachment);
    const password = "test-only-" + randomBytes(16).toString("hex");
    await auth.api.setPassword({
      body: { newPassword: password },
      headers: new Headers({ cookie: first.cookie }),
    });
    const third = await make("/sign-in/email", { email, password });
    assert.equal(third.status, 200);
    assert.equal(third.data.user.id, first.data.user.id);
    const credentials = await db.query(
      'SELECT password FROM "' + prefix + 'account" WHERE "providerId"=$1',
      ["credential"],
    );
    assert.notEqual(credentials.rows[0].password, password);
    assert.notEqual(
      (await make("/sign-in/email", { email, password: "incorrect-password" }))
        .status,
      200,
    );
    assert.equal(
      (
        await make(
          "/revoke-session",
          { token: second.data.token },
          first.cookie,
        )
      ).status,
      200,
    );
    assert.equal((await make("/get-session", null, second.cookie)).data, null);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        checkBudget("integration", "same", 60, 3),
      ),
    );
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 3);
    assert.ok(
      outcomes
        .filter((x) => x.status === "rejected")
        .every((x) => x.reason.status === 429),
    );
  },
);

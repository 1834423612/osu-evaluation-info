import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("database roles bind existing accounts, revoke immediately, audit changes and serialize last-admin protection", async (t) => {
  const path = "db/migrations/20261126_admin_roles.sql";
  assert.ok(existsSync(path), "identity role migration exists");
  const roles = await import("../../src/lib/auth/admin-roles.ts");
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE SCHEMA osu_identity_dev;
    CREATE TABLE osu_identity_dev."user"(id text PRIMARY KEY,name text,email text,"emailVerified" boolean,"createdAt" timestamptz DEFAULT now());
    INSERT INTO osu_identity_dev."user"(id,name,email,"emailVerified") VALUES('one','One','one@example.test',true),('two','Two','two@example.test',true),('ordinary','Ordinary','ordinary@example.test',true);`);
  const env = { NODE_ENV: "test" };
  await db.exec(roles.adminRolesSQL(readFileSync(path, "utf8"), env));
  const query = (sql, values) => db.query(sql, values);
  assert.equal(await roles.hasAdminRole("ordinary", query, env), false);
  await roles.changeAdminRole(
    query,
    { userId: "one", action: "grant", reason: "Initial operator bootstrap" },
    { actor: "operator:test", userId: null },
    env,
  );
  assert.equal(await roles.hasAdminRole("one", query, env), true);
  await db.query(
    'UPDATE osu_identity_dev."user" SET "emailVerified"=false WHERE id=$1',
    ["ordinary"],
  );
  await assert.rejects(
    roles.changeAdminRole(
      query,
      {
        userId: "ordinary",
        action: "grant",
        reason: "Unverified accounts cannot preserve admin access",
      },
      { actor: "account:one", userId: "one" },
      env,
    ),
    /ADMIN_ROLE_UNVERIFIED/,
  );
  await assert.rejects(
    roles.changeAdminRole(
      query,
      { userId: "two", action: "grant", reason: "Unauthorized ordinary user" },
      { actor: "account:ordinary", userId: "ordinary" },
      env,
    ),
    /ADMIN_ROLE_FORBIDDEN/,
  );
  await assert.rejects(
    roles.changeAdminRole(
      query,
      {
        userId: "missing",
        action: "grant",
        reason: "Unknown account rejected",
      },
      { actor: "account:one", userId: "one" },
      env,
    ),
    /foreign key/i,
  );
  await roles.changeAdminRole(
    query,
    { userId: "two", action: "grant", reason: "Second account administrator" },
    { actor: "account:one", userId: "one" },
    env,
  );
  const revoked = await Promise.allSettled([
    roles.changeAdminRole(
      query,
      {
        userId: "one",
        action: "revoke",
        reason: "Concurrent administrator removal",
      },
      { actor: "operator:test", userId: null },
      env,
    ),
    roles.changeAdminRole(
      query,
      {
        userId: "two",
        action: "revoke",
        reason: "Concurrent administrator removal",
      },
      { actor: "operator:test", userId: null },
      env,
    ),
  ]);
  assert.equal(
    revoked.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.match(
    revoked.find((result) => result.status === "rejected").reason.message,
    /LAST_ADMIN/,
  );
  assert.equal(await roles.hasAdminRole("one", query, env), false);
  assert.equal(await roles.hasAdminRole("two", query, env), true);
  const audit = (
    await db.query(
      "SELECT target_user_id,action,actor,reason FROM osu_identity_dev.account_role_audit ORDER BY id",
    )
  ).rows;
  assert.deepEqual(
    audit.map((row) => [row.target_user_id, row.action]),
    [
      ["one", "grant"],
      ["two", "grant"],
      ["one", "revoke"],
    ],
  );
  assert.equal(audit[0].actor, "operator:test");
  assert.equal(audit[1].reason, "Second account administrator");
  await assert.rejects(
    db.exec("DELETE FROM osu_identity_dev.account_role_audit"),
    /IMMUTABLE/,
  );
  await assert.rejects(
    db.exec("TRUNCATE osu_identity_dev.account_role"),
    /IMMUTABLE/,
  );
  await assert.rejects(
    db.exec("UPDATE osu_identity_dev.account_role SET role='admin'"),
    /IMMUTABLE/,
  );
  await assert.rejects(
    db.exec("DELETE FROM osu_identity_dev.\"user\" WHERE id='two'"),
    /LAST_ADMIN|AUDIT_CONTEXT/,
  );
  const users = await roles.listAdminUsers(
    query,
    { search: "two@example", page: 1 },
    env,
  );
  assert.equal(users.items.length, 1);
  assert.equal(users.items[0].admin, true);
  assert.equal(users.items[0].id, "two");
  await db.query(
    'UPDATE osu_identity_dev."user" SET "emailVerified"=false WHERE id=$1',
    ["two"],
  );
  assert.equal(
    await roles.hasAdminRole("two", query, env),
    false,
    "verification withdrawal immediately removes usable admin authority",
  );
  await assert.rejects(
    roles.changeAdminRole(
      query,
      {
        userId: "one",
        action: "grant",
        reason: "Unverified actor cannot grant roles",
      },
      { actor: "account:two", userId: "two" },
      env,
    ),
    /ADMIN_ROLE_FORBIDDEN/,
  );
});

test("admin roles reject development access to production identity and CLI mutations need an explicit account, operator and reason", async () => {
  const roles = await import("../../src/lib/auth/admin-roles.ts");
  const { parseAdminRoleOptions } =
    await import("../../scripts/user-data/admin-roles.mjs");
  assert.throws(
    () =>
      roles.adminRoleSchema({
        NODE_ENV: "development",
        AUTH_SCHEMA: "osu_identity",
      }),
    /production identity/,
  );
  assert.equal(
    roles.adminRoleSchema({ NODE_ENV: "production" }),
    "osu_identity",
  );
  assert.throws(
    () => parseAdminRoleOptions(["grant", "--user-id", "one"]),
    /--actor and --reason/,
  );
  assert.throws(
    () =>
      parseAdminRoleOptions([
        "grant",
        "--user-id",
        "one",
        "--actor",
        "operator",
        "--reason",
        "enough reason",
        "--apply",
        "--apply",
      ]),
    /Duplicate/,
  );
  const plan = parseAdminRoleOptions([
    "grant",
    "--user-id",
    "one",
    "--actor",
    "operator",
    "--reason",
    "Initial explicit grant",
    "--production",
  ]);
  assert.equal(plan.apply, false);
  assert.equal(plan.production, true);
  assert.equal(plan.userId, "one");
});

test("role namespaces honor authentication prefixes without granting across account installations", async (t) => {
  const roles = await import("../../src/lib/auth/admin-roles.ts");
  const db = new PGlite();
  t.after(() => db.close());
  const env = {
    NODE_ENV: "test",
    AUTH_SCHEMA: "roles_prefix_test",
    AUTH_TABLE_PREFIX: "ca_",
  };
  await db.exec(
    "CREATE SCHEMA roles_prefix_test;CREATE TABLE roles_prefix_test.ca_user(id text PRIMARY KEY,\"emailVerified\" boolean DEFAULT true);INSERT INTO roles_prefix_test.ca_user(id) VALUES ('one');",
  );
  await db.exec(
    roles.adminRolesSQL(
      readFileSync("db/migrations/20261126_admin_roles.sql", "utf8"),
      env,
    ),
  );
  const query = (sql, values) => db.query(sql, values);
  await roles.changeAdminRole(
    query,
    {
      userId: "one",
      action: "grant",
      reason: "Explicit prefixed installation",
    },
    { actor: "operator:test", userId: null },
    env,
  );
  assert.equal(await roles.hasAdminRole("one", query, env), true);
  assert.equal(
    (
      await db.query(
        "SELECT to_regclass('roles_prefix_test.account_role') AS plain",
      )
    ).rows[0].plain,
    null,
  );
});

test("administrator mutation origin guard rejects cross-site and non-JSON requests", async () => {
  const { assertAdminOrigin } = await import("../../src/lib/auth/admin.ts");
  const access = { actor: "development:test", development: true };
  const make = (origin, type = "application/json") =>
    new Request("http://localhost:3102/api/admin/users", {
      method: "POST",
      headers: { host: "localhost:3102", origin, "content-type": type },
      body: "{}",
    });
  assert.doesNotThrow(() =>
    assertAdminOrigin(make("http://localhost:3102"), access),
  );
  assert.throws(
    () => assertAdminOrigin(make("https://evil.example"), access),
    /origin/,
  );
  assert.throws(
    () =>
      assertAdminOrigin(make("http://localhost:3102", "text/plain"), access),
    /origin/,
  );
});

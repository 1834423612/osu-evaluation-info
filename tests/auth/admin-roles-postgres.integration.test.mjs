import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { loadCatalogEnvironment } from "../../scripts/catalog/database.mjs";
import {
  adminRolesSQL,
  changeAdminRole,
  hasAdminRole,
} from "../../src/lib/auth/admin-roles.ts";

test(
  "PostgreSQL connections serialize final-admin revocation and recheck an actor revoked while waiting",
  { skip: process.env.ADMIN_ROLES_DATABASE_TEST !== "1", timeout: 30000 },
  async () => {
    loadCatalogEnvironment();
    const schema = "admin_role_test_" + randomUUID().replaceAll("-", "");
    assert.match(schema, /^admin_role_test_[a-f0-9]{32}$/);
    const env = { NODE_ENV: "test", AUTH_SCHEMA: schema };
    const clients = Array.from(
      { length: 3 },
      () =>
        new pg.Client({
          connectionString: process.env.DATABASE_URL,
          statement_timeout: 8000,
          connectionTimeoutMillis: 5000,
        }),
    );
    const [setup, first, second] = clients;
    try {
      await Promise.all(clients.map((client) => client.connect()));
      await setup.query(
        `CREATE SCHEMA "${schema}";CREATE TABLE "${schema}"."user"(id text PRIMARY KEY,name text,email text,"emailVerified" boolean DEFAULT true,"createdAt" timestamptz DEFAULT now());INSERT INTO "${schema}"."user"(id) VALUES('one'),('two'),('ordinary');`,
      );
      await setup.query(
        adminRolesSQL(
          readFileSync("db/migrations/20261126_admin_roles.sql", "utf8"),
          env,
        ),
      );
      const query = (client) => (sql, values) => client.query(sql, values);
      const operator = { actor: "operator:isolated-test", userId: null };
      const change = (client, userId, action, access = operator) =>
        changeAdminRole(
          query(client),
          { userId, action, reason: "Isolated concurrency regression" },
          access,
          env,
        );
      await change(setup, "one", "grant");
      await change(setup, "two", "grant");
      const results = await Promise.allSettled([
        change(first, "one", "revoke"),
        change(second, "two", "revoke"),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.match(
        results.find((result) => result.status === "rejected").reason.message,
        /LAST_ADMIN/,
      );
      await change(setup, "one", "grant");
      await change(setup, "two", "grant");
      await first.query("BEGIN");
      await change(first, "one", "revoke");
      const waiting = change(second, "ordinary", "grant", {
        actor: "account:one",
        userId: "one",
      });
      const denied = assert.rejects(waiting, /ADMIN_ROLE_FORBIDDEN/);
      await first.query("COMMIT");
      await denied;
      assert.equal(await hasAdminRole("one", query(setup), env), false);
      assert.equal(await hasAdminRole("ordinary", query(setup), env), false);
    } finally {
      await Promise.all(
        [first, second].map((client) =>
          client.query("ROLLBACK").catch(() => {}),
        ),
      );
      await setup
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => {});
      await Promise.all(clients.map((client) => client.end().catch(() => {})));
    }
  },
);

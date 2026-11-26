import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authBackupTables,
  backupConnectionEnv,
} from "../../scripts/user-data/backup-config.mjs";
test("backup scopes exact auth models and puts connection secrets only in child environment", () => {
  assert.deepEqual(authBackupTables("ca_"), [
    "ca_user",
    "ca_session",
    "ca_account",
    "ca_verification",
    "ca_rate_limit",
    "ca_passkey",
    "ca_account_role",
    "ca_account_role_audit",
    "ca_admin_role_guard",
  ]);
  assert.equal(
    authBackupTables("ca_").some((x) => x.startsWith("ca_dev_")),
    false,
  );
  assert.throws(() => authBackupTables("ca_; DROP SCHEMA public"));
  const env = backupConnectionEnv(
    "postgresql://qa:p%40ss%3Aword@localhost:5544/test%2Ddb?sslmode=verify-full&sslrootcert=%2Ftmp%2Fca.crt",
  );
  assert.equal(env.PGPASSWORD, "p@ss:word");
  assert.equal(env.PGPORT, "5544");
  assert.equal(env.PGSSLMODE, "verify-full");
  assert.equal(env.PGSSLROOTCERT, "/tmp/ca.crt");
  assert.throws(() =>
    backupConnectionEnv("postgresql://localhost/db?options=unexpected"),
  );
});

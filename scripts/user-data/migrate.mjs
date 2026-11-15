import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
for (const path of [".env.local", ".env"])
  if (existsSync(path)) process.loadEnvFile(path);
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const { getDatabasePool } = await import("../../src/lib/db.ts");
const { userDataSchema, domainSQL, domainSchemas } =
  await import("../../src/lib/user-data/namespace.ts");
const { authTablePrefix } = await import("../../src/lib/auth/config.ts");
const files = [
  "20261114_sharing.sql",
  "20261114_share_requests.sql",
  "20261114_sync.sql",
  "20261114_transfers.sql",
  "20261114_page_links.sql",
  "20261114_telemetry.sql",
  "20261114_diagnostics.sql",
  "20261114_statistics.sql",
  "20261115_visitor_context.sql",
  "20261115_cooldowns.sql",
];
const db = getDatabasePool(),
  schema = userDataSchema(),
  apply = process.argv.includes("--apply");
let client;
try {
  client = await db.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "waho-user-data:" + schema,
  ]);
  const marker = await client.query("SELECT to_regclass($1) AS present", [
    schema + ".installation",
  ]);
  if (!marker.rows[0].present)
    throw new Error("Run account:migrate --apply first");
  const owned = await client.query(
    'SELECT 1 FROM "' + schema + '".installation WHERE name=$1',
    ["auth:" + authTablePrefix()],
  );
  if (!owned.rows.length)
    throw new Error("User-data namespace ownership was not verified");
  const registry = await client.query("SELECT to_regclass($1) AS present", [
    schema + ".schema_migration",
  ]);
  if (apply)
    await client.query(
      'CREATE TABLE IF NOT EXISTS "' +
        schema +
        '".schema_migration(name text PRIMARY KEY,sha text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
  for (const name of files) {
    const sql = readFileSync("db/migrations/" + name, "utf8"),
      sha = createHash("sha256").update(sql).digest("hex");
    const prior =
      registry.rows[0].present || apply
        ? await client.query(
            'SELECT sha FROM "' + schema + '".schema_migration WHERE name=$1',
            [name],
          )
        : { rows: [] };
    if (prior.rows[0]) {
      if (prior.rows[0].sha !== sha)
        throw new Error("Previously applied migration changed: " + name);
      continue;
    }
    console.log(
      JSON.stringify({
        migration: name,
        status: apply ? "applying" : "pending",
      }),
    );
    if (apply) {
      await client.query(
        domainSchemas()
          .map((name) => 'CREATE SCHEMA IF NOT EXISTS "' + name + '";')
          .join("\n"),
      );
      await client.query(domainSQL(sql));
      await client.query(
        'INSERT INTO "' + schema + '".schema_migration(name,sha) VALUES($1,$2)',
        [name, sha],
      );
    }
  }
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(
    apply ? "User-data schema ready" : "Read-only migration plan complete",
  );
} catch (error) {
  if (client) await client.query("ROLLBACK");
  throw error;
} finally {
  client?.release();
  await db.end();
}

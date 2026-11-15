import { existsSync, writeFileSync, readFileSync } from "node:fs";
for (const path of [".env.local", ".env"])
  if (existsSync(path)) process.loadEnvFile(path);
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const { getMigrations } = await import("better-auth/db/migration");
const { createAuth } = await import("../../src/lib/auth/server.ts");
const { userDataSchema, domainSQL } =
  await import("../../src/lib/user-data/namespace.ts");
const { authConfigured, authTablePrefix, authSchema } =
  await import("../../src/lib/auth/config.ts");
const { getAuthPool } = await import("../../src/lib/auth/database.ts");
if (!authConfigured())
  throw new Error(
    "Configure DATABASE_URL, BETTER_AUTH_SECRET (32+ characters) and the authentication origin first",
  );
const db = getAuthPool(),
  schema = userDataSchema(),
  prefix = authTablePrefix(),
  apply = process.argv.includes("--apply");
const base = readFileSync("db/migrations/20261114_user_data_base.sql", "utf8");
const baseSQL = domainSQL(base);
const unique =
  'CREATE UNIQUE INDEX IF NOT EXISTS "' +
  prefix +
  'passkey_credential_unique" ON "' +
  prefix +
  'passkey" ("credentialID");';
const marker =
  'CREATE TABLE IF NOT EXISTS "' +
  schema +
  '".installation (name text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()); INSERT INTO "' +
  schema +
  "\".installation(name) VALUES ('auth:" +
  prefix +
  "') ON CONFLICT DO NOTHING;";
if (apply) await db.query('CREATE SCHEMA IF NOT EXISTS "' + authSchema() + '"');
let client;
try {
  if (apply) {
    client = await db.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "waho-auth-migrate:" + prefix,
    ]);
  }
  const auth = createAuth(),
    plan = await getMigrations(auth.options);
  if (plan.unsafeChanges.length || plan.schemaProblems.length)
    throw new Error("Authentication migration has unsafe changes");
  for (const row of [
    ...plan.toBeCreated,
    ...plan.toBeAdded,
    ...plan.toBeAddedIndexes,
  ])
    if (
      !row.table.startsWith(prefix) ||
      ![
        "user",
        "session",
        "account",
        "verification",
        "rate_limit",
        "passkey",
      ].includes(row.table.slice(prefix.length))
    )
      throw new Error("Migration outside configured authentication prefix");
  const sql = await plan.compileMigrations();
  if (process.argv.includes("--output")) {
    const path = process.argv[process.argv.indexOf("--output") + 1];
    if (!path) throw new Error("Output file missing");
    writeFileSync(
      path,
      "BEGIN;\n" +
        baseSQL +
        "\n" +
        sql +
        "\n" +
        unique +
        "\n" +
        marker +
        "\nCOMMIT;\n",
    );
    console.log("Migration SQL written");
  }
  console.log(
    JSON.stringify({
      create: plan.toBeCreated.map((x) => x.table),
      add: plan.toBeAdded.map((x) => x.table),
      indexes: plan.toBeAddedIndexes.length,
    }),
  );
  if (client) {
    const known = await client.query("SELECT to_regclass($1) AS marker", [
      schema + ".installation",
    ]);
    let owned = false;
    if (known.rows[0].marker) {
      const r = await client.query(
        'SELECT 1 FROM "' + schema + '".installation WHERE name=$1',
        ["auth:" + prefix],
      );
      owned = !!r.rows.length;
    }
    const existing = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename=ANY($1::text[])",
      [
        [
          "user",
          "session",
          "account",
          "verification",
          "rate_limit",
          "passkey",
        ].map((x) => prefix + x),
      ],
    );
    if (existing.rows.length && !owned)
      throw new Error(
        "Existing authentication tables are not owned by this installation",
      );
    await client.query(baseSQL);
    await client.query(sql || "SELECT 1");
    await client.query(unique);
    await client.query(
      'CREATE TABLE IF NOT EXISTS "' +
        schema +
        '".installation (name text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())',
    );
    await client.query(
      'INSERT INTO "' +
        schema +
        '".installation(name) VALUES($1) ON CONFLICT DO NOTHING',
      ["auth:" + prefix],
    );
    await client.query("COMMIT");
    console.log("Authentication schema ready");
  }
} catch (error) {
  if (client) await client.query("ROLLBACK");
  throw error;
} finally {
  client?.release();
  await db.end();
}

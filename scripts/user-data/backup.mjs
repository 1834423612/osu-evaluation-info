import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  statSync,
  chmodSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { authBackupTables, backupConnectionEnv } from "./backup-config.mjs";
for (const p of [".env.local", ".env"])
  if (existsSync(p)) process.loadEnvFile(p);
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const { getDatabasePool } = await import("../../src/lib/db.ts"),
  { userDataSchema, domainSchemas } =
    await import("../../src/lib/user-data/namespace.ts"),
  { authTablePrefix, authSchema: accountSchema } =
    await import("../../src/lib/auth/config.ts");
const db = getDatabasePool(),
  schema = userDataSchema(),
  prefix = authTablePrefix(),
  apply = process.argv.includes("--apply");
let client;
async function command(program, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      env,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    // Do not forward pg stderr: it can contain deployment connection details.
    child.stderr.resume();
    child.on("error", () => reject(Error(program + " is unavailable")));
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error(program + " failed (" + code + ")")),
    );
  });
}
try {
  client = await db.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL statement_timeout='5min'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout='10min'");
  const marker = await client.query("SELECT to_regclass($1) AS present", [
    schema + ".installation",
  ]);
  if (!marker.rows[0].present)
    throw Error("User-data installation marker is missing");
  const owned = await client.query(
    'SELECT 1 FROM "' + schema + '".installation WHERE name=$1',
    ["auth:" + prefix],
  );
  if (!owned.rows.length) throw Error("User-data ownership was not verified");
  const authSchema = accountSchema();
  if (!/^[_a-z][_a-z0-9]*$/.test(authSchema))
    throw Error("Unexpected authentication schema");
  // Include identity routines and role triggers even when AUTH_SCHEMA is overridden.
  const schemas = [...new Set([...domainSchemas(), authSchema])];
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename=ANY($2::text[]) ORDER BY tablename",
      [authSchema, authBackupTables(prefix)],
    )
  ).rows.map((x) => x.tablename);
  if (!tables.includes(prefix + "user") || !tables.includes(prefix + "session"))
    throw Error("Authentication tables are missing");
  const domain = (
    await client.query(
      "SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1::text[]) AND NOT (schemaname=$2 AND tablename=ANY($3::text[])) ORDER BY schemaname,tablename",
      [schemas, authSchema, authBackupTables(prefix)],
    )
  ).rows.map((x) => x.schemaname + "." + x.tablename);
  if (domain.some((x) => !/^[_a-z][_a-z0-9]*\.[_a-z][_a-z0-9]*$/.test(x)))
    throw Error("Unexpected table identifier");
  console.log(
    JSON.stringify({
      mode: apply ? "backup" : "plan",
      schema,
      authSchema,
      authTables: tables,
      domainTables: domain,
    }),
  );
  if (apply) {
    const env = {
        ...process.env,
        ...backupConnectionEnv(process.env.DATABASE_URL),
      },
      root = resolve(".cache/user-data-backups");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const dir = join(
      root,
      (process.env.NODE_ENV === "production" ? "production-" : "development-") +
        new Date().toISOString().replaceAll(":", "-") +
        "-" +
        randomUUID().slice(0, 8),
    );
    mkdirSync(dir, { mode: 0o700 });
    const snapshot = (
      await client.query("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0].snapshot;
    const manifest = {
      version: 1,
      schema,
      authSchema,
      prefix,
      createdAt: new Date().toISOString(),
      files: [],
      rows: {},
    };
    for (const [name, args] of [
      [
        "user-data.dump",
        [
          ...schemas.map((name) => "--schema=" + name),
          ...tables.map((name) => "--exclude-table=" + authSchema + "." + name),
        ],
      ],
      [
        "authentication.dump",
        tables.map((t) => "--table=" + authSchema + "." + t),
      ],
    ]) {
      const file = join(dir, name);
      await command(
        "pg_dump",
        [
          "--format=custom",
          "--no-owner",
          "--no-privileges",
          "--strict-names",
          "--snapshot=" + snapshot,
          "--file=" + file,
          ...args,
        ],
        env,
      );
      chmodSync(file, 0o600);
      // Fully decode the archive into a sink without touching any database.
      await command(
        "pg_restore",
        [
          "--file=" + (process.platform === "win32" ? "NUL" : "/dev/null"),
          file,
        ],
        env,
      );
      manifest.files.push({
        name,
        bytes: statSync(file).size,
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
      });
    }
    for (const [ns, name] of [
      ...domain.map((x) => x.split(".")),
      ...tables.map((name) => [authSchema, name]),
    ]) {
      const result = await client.query(
        'SELECT count(*)::text AS n FROM "' + ns + '"."' + name + '"',
      );
      manifest.rows[ns + "." + name] = result.rows[0].n;
    }
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      JSON.stringify({
        status: "verified-readable",
        directory: dir,
        files: manifest.files.map((x) => ({ name: x.name, bytes: x.bytes })),
      }),
    );
  }
  await client.query("ROLLBACK");
} catch (error) {
  if (client) await client.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : "Backup failed");
  process.exitCode = 1;
} finally {
  client?.release();
  await db.end();
}

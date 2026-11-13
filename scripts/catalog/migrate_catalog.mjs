import { readFile } from "node:fs/promises";
import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
  withPageTransaction,
} from "./database.mjs";

if (process.argv.includes("--help")) {
  console.log(
    "Usage: pnpm catalog:migrate\nApply catalog migrations explicitly; recurring synchronization never runs DDL.",
  );
  process.exit(0);
}
loadCatalogEnvironment();
const client = createCatalogClient("osu-catalog-migrate");
let locked = false;
try {
  await client.connect();
  locked = (
    await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
      CATALOG_LOCK,
    ])
  ).rows[0].locked;
  if (!locked)
    throw new Error("Another catalog maintenance operation is running.");
  await client.query("CREATE SCHEMA IF NOT EXISTS osu_catalog");
  await client.query(
    "CREATE TABLE IF NOT EXISTS osu_catalog.schema_versions (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const migrations = [
    { version: 4, file: "../../db/migrations/catalog/004-term-archives.sql" },
    {
      version: 3,
      file: "../../db/migrations/catalog/003-permanent-archive.sql",
    },
    {
      version: 2,
      file: "../../db/migrations/catalog/002-versioned-snapshots.sql",
    },
    { version: 1, file: "../../db/schemas/catalog.sql" },
  ];
  for (const migration of migrations.sort((a, b) => a.version - b.version)) {
    if (
      (
        await client.query(
          "SELECT 1 FROM osu_catalog.schema_versions WHERE version=$1",
          [migration.version],
        )
      ).rowCount
    )
      continue;
    const sql = await readFile(
      new URL(migration.file, import.meta.url),
      "utf8",
    );
    await withPageTransaction(client, async () => {
      await client.query(sql);
      await client.query(
        "INSERT INTO osu_catalog.schema_versions(version) VALUES($1)",
        [migration.version],
      );
    });
    console.log(`Applied catalog migration ${migration.version}.`);
  }
  console.log("Catalog schema is up to date.");
} catch (error) {
  console.error(
    `Catalog migration failed (${error.code ?? "configuration"}): ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  if (locked)
    await client
      .query("SELECT pg_advisory_unlock($1)", [CATALOG_LOCK])
      .catch(() => {});
  await client.end().catch(() => {});
}

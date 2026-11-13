import pg from "pg";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const CATALOG_LOCK = 674120201;
export const CATALOG_SCHEMA_VERSION = 4;

export function loadCatalogEnvironment() {
  for (const name of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(new URL(`../../${name}`, import.meta.url));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export function createCatalogClient(applicationName) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  return new pg.Client({
    connectionString: process.env.DATABASE_URL,
    application_name: applicationName,
    connectionTimeoutMillis: 5000,
    lock_timeout: 2000,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 30_000,
  });
}

export async function requireCatalogSchema(client) {
  const exists = await client.query(
    "SELECT to_regclass('osu_catalog.schema_versions') IS NOT NULL AS installed",
  );
  const version = exists.rows[0].installed
    ? Number(
        (
          await client.query(
            "SELECT max(version) AS version FROM osu_catalog.schema_versions",
          )
        ).rows[0].version,
      )
    : 0;
  if (version < CATALOG_SCHEMA_VERSION) {
    throw new Error(
      "Catalog schema is outdated. Run pnpm catalog:migrate before synchronization.",
    );
  }
}

const RETRYABLE = new Set(["40P01", "40001", "55P03"]);

/** Retry only known-aborted transactions; the checkpoint commits with its page. */
export async function withPageTransaction(
  client,
  action,
  {
    attempts = 3,
    wait = delay,
    onRetry = (error, attempt) =>
      console.warn(
        `Catalog transaction retry ${attempt}/${attempts - 1} (${error.code}).`,
      ),
  } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await client.query("BEGIN");
    try {
      const result = await action();
      await client.query("COMMIT");
      return result;
    } catch (error) {
      let rolledBack = false;
      try {
        await client.query("ROLLBACK");
        rolledBack = true;
      } catch {
        /* Do not reuse a broken connection. */
      }
      if (!rolledBack || !RETRYABLE.has(error.code) || attempt === attempts)
        throw error;
      onRetry(error, attempt);
      await wait(200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150));
    }
  }
}

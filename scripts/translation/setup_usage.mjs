import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error(
    "DATABASE_URL is required to install translation usage statistics.",
  );
  process.exitCode = 1;
} else {
  const client = new pg.Client({
    connectionString,
    application_name: "osu-translation-migration",
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    lock_timeout: 3000,
  });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      await readFile(
        new URL("../../db/schemas/translation.sql", import.meta.url),
        "utf8",
      ),
    );
    await client.query("COMMIT");
    console.log("Installed osu_translation.daily_usage.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(
      `Could not install translation usage schema (${error.code ?? error.name}).`,
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

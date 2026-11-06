import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error(
    "DATABASE_URL is required to install the OSU directory cache schema.",
  );
  process.exitCode = 1;
} else {
  const client = new pg.Client({
    connectionString,
    application_name: "osu-people-directory-migration",
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await client.query(
      await readFile(
        new URL("../db/people_directory_schema.sql", import.meta.url),
        "utf8",
      ),
    );
    const installed = await client.query(
      "SELECT to_regclass('osu_directory.person_cache') IS NOT NULL AS installed",
    );
    if (!installed.rows[0]?.installed)
      throw new Error("The OSU directory cache table was not installed.");
    console.log("Installed osu_directory.person_cache.");
  } catch (error) {
    console.error(
      `Could not install the OSU directory cache schema (${error.code ?? error.name}).`,
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

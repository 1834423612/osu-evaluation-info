import { readFile } from "node:fs/promises";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";

loadCatalogEnvironment();
const client = createCatalogClient("osu-syllabus-migrate");
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(674120205)");
  await client.query(
    await readFile(
      new URL("../../db/migrations/syllabus/001-syllabus.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.query(
    await readFile(
      new URL(
        "../../db/migrations/syllabus/002-catalog-links.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await client.query("COMMIT");
  console.log("Syllabus schema version 2 is ready.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    `Syllabus migration failed (${error.code ?? "configuration"}).`,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}

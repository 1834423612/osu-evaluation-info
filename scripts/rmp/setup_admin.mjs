import { readFile } from "node:fs/promises";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
import {
  rmpAdminSQL,
  rmpAdminSchema,
} from "../../src/lib/rmp/admin-namespace.ts";
loadCatalogEnvironment();
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const client = createCatalogClient("rmp-admin-migration");
try {
  await client.connect();
  await client.query(
    rmpAdminSQL(
      await readFile(
        new URL("../../db/schemas/rmp-admin.sql", import.meta.url),
        "utf8",
      ),
    ),
  );
  await client.query(
    rmpAdminSQL(
      await readFile(
        new URL("../../db/schemas/rmp-assistance.sql", import.meta.url),
        "utf8",
      ),
    ),
  );
  console.log("RMP administration schema installed: " + rmpAdminSchema());
} finally {
  await client.end();
}

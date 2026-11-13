import { readFile } from "node:fs/promises";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
loadCatalogEnvironment();
const client = createCatalogClient("osu-rmp-library-migration");
try {
  await client.connect();
  await client.query(
    await readFile(
      new URL("../../db/schemas/rmp-library.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("RMP library source-retention protection installed.");
} finally {
  await client.end();
}

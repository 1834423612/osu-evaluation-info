import "server-only";
import { Pool } from "pg";
import { getDatabasePool } from "../db";
import { readPublicCatalog, type PublicCatalog } from "./public-catalog";

declare global {
  var osuPlanningPool: Pool | undefined;
}
let cache: { expires: number; value: Promise<PublicCatalog> } | undefined;
export function loadPublicCatalog() {
  if (cache && cache.expires > Date.now()) return cache.value;
  let pool = process.env.PLANNING_DATABASE_URL
    ? global.osuPlanningPool
    : getDatabasePool();
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.PLANNING_DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 4000,
      statement_timeout: 8000,
      application_name: "osu-planning",
    });
    pool.on("error", () => console.warn("Planning database connection closed"));
    global.osuPlanningPool = pool;
  }
  const entry = { expires: Date.now() + 60000, value: readPublicCatalog(pool) };
  cache = entry;
  void entry.value.catch(() => {
    if (cache === entry) cache = undefined;
  });
  return entry.value;
}

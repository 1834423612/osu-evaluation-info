import { Pool } from "pg";
import { authSchema } from "./config.ts";
const pools = new Map<string, Pool>();
export function getAuthPool() {
  const schema = authSchema();
  let pool = pools.get(schema);
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: "-c search_path=" + schema,
      max: 4,
      connectionTimeoutMillis: 4000,
      statement_timeout: 8000,
      application_name: "osu-accounts",
    });
    pool.on("error", () => {});
    pools.set(schema, pool);
  }
  return pool;
}

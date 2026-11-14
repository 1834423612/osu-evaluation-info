import { Pool } from "pg";
import { DatabaseNotConfiguredError } from "../db.ts";
declare global {
  var osuTelemetryPool: Pool | undefined;
}
/** Nonessential writes cannot consume the course-query pool. */
export function getTelemetryPool() {
  if (!process.env.DATABASE_URL?.trim()) throw new DatabaseNotConfiguredError();
  if (!global.osuTelemetryPool) {
    global.osuTelemetryPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      statement_timeout: 3000,
      application_name: "osu-telemetry",
    });
    global.osuTelemetryPool.on("error", () => {});
  }
  return global.osuTelemetryPool;
}

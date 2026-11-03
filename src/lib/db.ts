import { Pool, type QueryResultRow } from "pg";

declare global {
  var osuEvaluationPool: Pool | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** One pool per Node process, including across Next development reloads. */
export function getDatabasePool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new DatabaseNotConfiguredError();
  if (!global.osuEvaluationPool) {
    global.osuEvaluationPool = new Pool({
      connectionString,
      max: 6,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 4_000,
      statement_timeout: 8_000,
      application_name: "osu-course-explorer",
    });
    // An idle connection can fail after a server restart without a waiting query.
    // Never log the connection string or database error details to the browser.
    global.osuEvaluationPool.on("error", () => {
      console.warn(
        "PostgreSQL idle connection closed; the pool will reconnect.",
      );
    });
  }
  return global.osuEvaluationPool;
}

export async function queryDatabase<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
) {
  return getDatabasePool().query<Row>(text, Array.from(values));
}

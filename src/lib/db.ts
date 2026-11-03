import { Pool, type QueryResultRow } from "pg";

declare global {
  var osuEvaluationPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL?.trim();

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured() {
  return Boolean(connectionString);
}

/**
 * Creates one process-local pool lazily. API handlers import this module in
 * development frequently, so a global singleton prevents excess connections.
 */
export function getDatabasePool() {
  if (!connectionString) {
    throw new DatabaseNotConfiguredError();
  }

  if (!global.osuEvaluationPool) {
    global.osuEvaluationPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: "osu-eval-web",
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

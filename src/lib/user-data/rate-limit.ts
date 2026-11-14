import { createHmac } from "node:crypto";
import { queryDatabase } from "../db.ts";
import { userDataTable } from "./namespace.ts";
import { UserDataError } from "./http.ts";
export function privateDigest(value: string, purpose: string) {
  const secret = process.env.USER_DATA_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("User data secret is not configured");
  return createHmac("sha256", secret)
    .update("waho:" + purpose + ":" + value)
    .digest("hex");
}
export async function checkBudget(
  scope: string,
  subject: string,
  windowSeconds: number,
  max: number,
  options: {
    cost?: number;
    query?: (
      sql: string,
      values: readonly unknown[],
    ) => Promise<{ rows: unknown[] }>;
  } = {},
) {
  const cost = options.cost ?? 1;
  if (
    !Number.isInteger(windowSeconds) ||
    windowSeconds < 1 ||
    !Number.isInteger(max) ||
    max < 1 ||
    !Number.isInteger(cost) ||
    cost < 1
  )
    throw new Error("Invalid rate limit");
  if (cost > max) throw new UserDataError("rate_limited", 429);
  const bucket = privateDigest(scope + ":" + subject, "rate-limit");
  const result = await (options.query ?? queryDatabase)(
    "INSERT INTO " +
      userDataTable("rate_bucket") +
      " (bucket,window_start,hits,expires_at) VALUES ($1,floor(extract(epoch from statement_timestamp())/$2::int)::bigint,$4,statement_timestamp()+$2::int*interval '2 seconds') ON CONFLICT(bucket,window_start) DO UPDATE SET hits=" +
      userDataTable("rate_bucket") +
      ".hits+$4 WHERE " +
      userDataTable("rate_bucket") +
      ".hits+$4<=$3 RETURNING hits",
    [bucket, windowSeconds, max, cost],
  );
  if (!result.rows.length) throw new UserDataError("rate_limited", 429);
}

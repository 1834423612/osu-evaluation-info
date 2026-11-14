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
) {
  if (
    !Number.isInteger(windowSeconds) ||
    windowSeconds < 1 ||
    !Number.isInteger(max) ||
    max < 1
  )
    throw new Error("Invalid rate limit");
  const bucket = privateDigest(scope + ":" + subject, "rate-limit");
  const result = await queryDatabase(
    "INSERT INTO " +
      userDataTable("rate_bucket") +
      " (bucket,window_start,hits,expires_at) VALUES ($1,floor(extract(epoch from statement_timestamp())/$2::int)::bigint,1,statement_timestamp()+$2::int*interval '2 seconds') ON CONFLICT(bucket,window_start) DO UPDATE SET hits=" +
      userDataTable("rate_bucket") +
      ".hits+1 WHERE " +
      userDataTable("rate_bucket") +
      ".hits<$3 RETURNING hits",
    [bucket, windowSeconds, max],
  );
  if (!result.rows.length) throw new UserDataError("rate_limited", 429);
}

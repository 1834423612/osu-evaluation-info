import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { privateDigest, checkBudget } from "../user-data/rate-limit.ts";
import { UserDataError } from "../user-data/http.ts";
import { planShareSchema, type PlanShare } from "./share-snapshot.ts";
export const planningShareInput = z.object({
  snapshot: planShareSchema,
  expiresIn: z
    .union([
      z.literal(0),
      z.literal(86400),
      z.literal(604800),
      z.literal(2592000),
    ])
    .default(604800),
});
export const planningShareRead = z.object({
  id: z.uuid(),
  capability: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
type Row = {
  id: string;
  owner_id: string;
  seed: string;
  snapshot: PlanShare;
  expires_at: Date | null;
};
const capability = (row: Row) =>
  Buffer.from(
    privateDigest(
      row.id + ":" + row.owner_id + ":" + row.seed,
      "planning-share",
    ),
    "hex",
  ).toString("base64url");
const result = (row: Row) => ({
  id: row.id,
  title: row.snapshot.title,
  capability: capability(row),
  expiresAt: row.expires_at,
});
export async function listPlanningShares(owner: string) {
  const rows = await getDatabasePool().query(
    "SELECT * FROM " +
      table("planning_share") +
      " WHERE owner_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 20",
    [owner],
  );
  return rows.rows.map((row: Row) => result(row));
}
export async function publishPlanningShare(
  owner: string,
  input: z.infer<typeof planningShareInput>,
) {
  const parsed = planningShareInput.parse(input);
  const snapshot = planShareSchema.parse(parsed.snapshot),
    encoded = JSON.stringify(snapshot),
    bytes = Buffer.byteLength(encoded);
  if (bytes > 524288) throw new UserDataError("too_large", 413);
  await checkBudget("planning-publish", owner, 3600, 30);
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "planning-share:" + owner,
    ]);
    const capacity = (
      await db.query(
        "SELECT count(*)::int AS count, coalesce(sum(bytes),0)::int AS bytes FROM " +
          table("planning_share") +
          " WHERE owner_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",
        [owner],
      )
    ).rows[0];
    if (capacity.count >= 20 || capacity.bytes + bytes > 4194304)
      throw new UserDataError("share_capacity", 409);
    const row = (
      await db.query(
        "INSERT INTO " +
          table("planning_share") +
          "(id,owner_id,seed,snapshot,bytes,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          randomUUID(),
          owner,
          randomUUID(),
          encoded,
          bytes,
          parsed.expiresIn
            ? new Date(Date.now() + parsed.expiresIn * 1000)
            : null,
        ],
      )
    ).rows[0] as Row;
    await db.query("COMMIT");
    return result(row);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function readPlanningShare(
  input: z.infer<typeof planningShareRead>,
) {
  const parsed = planningShareRead.parse(input);
  const row = (
    await getDatabasePool().query(
      "SELECT * FROM " +
        table("planning_share") +
        " WHERE id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",
      [parsed.id],
    )
  ).rows[0] as Row | undefined;
  if (
    !row ||
    !timingSafeEqual(
      Buffer.from(capability(row)),
      Buffer.from(parsed.capability),
    )
  )
    throw new UserDataError("unavailable", 404);
  return {
    snapshot: planShareSchema.parse(row.snapshot),
    expiresAt: row.expires_at,
  };
}
export async function revokePlanningShare(owner: string, id: string) {
  z.uuid().parse(id);
  await getDatabasePool().query(
    "UPDATE " +
      table("planning_share") +
      " SET revoked_at=now() WHERE id=$1 AND owner_id=$2",
    [id, owner],
  );
}

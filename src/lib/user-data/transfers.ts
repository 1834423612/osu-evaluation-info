import { randomUUID, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { snapshotSchema, type SavedSnapshot } from "../saved/exchange.ts";
import { getDatabasePool, queryDatabase } from "../db.ts";
import { userDataTable as table } from "./namespace.ts";
import { UserDataError } from "./http.ts";
import { privateDigest, checkBudget } from "./rate-limit.ts";
import type { Actor } from "./principal.ts";
export const transferCreateSchema = z.object({
  requestId: z.uuid(),
  snapshot: snapshotSchema,
  expiresIn: z.number().int().min(900).max(604800).default(3600),
});
export const transferActionSchema = z.object({
  action: z.enum(["status", "claim", "ack", "revoke", "approve"]),
  capability: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
  pairId: z.uuid().optional(),
  claim: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
});
export const transferRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
type Transfer = {
  id: string;
  owner_id: string;
  request_digest: string;
  seed: string;
  snapshot: SavedSnapshot;
  expires_at: Date;
  revoked_at: Date | null;
  claimed_by: string | null;
  claim_seed: string | null;
  lease_until: Date | null;
  completed_at: Date | null;
  code?: string | null;
};
function token(row: Transfer, purpose = "link") {
  return Buffer.from(
    privateDigest(
      row.id +
        ":" +
        (purpose === "claim"
          ? row.claimed_by + ":" + row.claim_seed
          : row.owner_id + ":" + row.seed),
      "transfer-" + purpose,
    ),
    "hex",
  ).toString("base64url");
}
function matches(a: string | undefined, b: string) {
  return (
    !!a &&
    a.length === b.length &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function live(row: Transfer | undefined) {
  if (
    !row ||
    row.revoked_at ||
    new Date(row.expires_at).getTime() <= Date.now() ||
    row.completed_at
  )
    throw new UserDataError("not_available", 404);
  return row;
}
function created(row: Transfer, actor: Actor, digest: string) {
  live(row);
  if (row.owner_id !== actor.id || row.request_digest !== digest)
    throw new UserDataError("request_conflict", 409);
  return {
    id: row.id,
    capability: token(row),
    code: row.code ?? null,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}
export async function createTransfer(actor: Actor, raw: unknown) {
  const input = transferCreateSchema.parse(raw);
  if (!actor.id) throw new UserDataError("unauthorized", 401);
  const encoded = JSON.stringify(input.snapshot),
    bytes = Buffer.byteLength(encoded);
  if (bytes > 1048576) throw new UserDataError("too_large", 413);
  const digest = privateDigest(
      encoded + ":" + input.expiresIn,
      "transfer-request",
    ),
    sql =
      "SELECT t.*,(SELECT code FROM " +
      table("transfer_code") +
      " c WHERE c.transfer_id=t.id AND c.expires_at>now() LIMIT 1) AS code FROM " +
      table("transfer") +
      " t WHERE t.id=$1";
  const prior = (await queryDatabase<Transfer>(sql, [input.requestId])).rows[0];
  if (prior) return created(prior, actor, digest);
  await checkBudget("transfer-create", actor.id, 86400, 30);
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "transfer:" + actor.id,
    ]);
    const again = (await db.query<Transfer>(sql, [input.requestId])).rows[0];
    if (again) {
      await db.query("COMMIT");
      return created(again, actor, digest);
    }
    const q = (
      await db.query<{ n: string; bytes: string }>(
        "SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM " +
          table("transfer") +
          " WHERE owner_id=$1 AND revoked_at IS NULL AND completed_at IS NULL AND expires_at>now()",
        [actor.id],
      )
    ).rows[0];
    if (Number(q.n) >= 10 || Number(q.bytes) + bytes > 10485760)
      throw new UserDataError("quota", 409);
    const row = (
      await db.query<Transfer>(
        "INSERT INTO " +
          table("transfer") +
          "(id,owner_id,request_digest,seed,snapshot,bytes,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,now()+$7*interval '1 second') RETURNING *",
        [
          input.requestId,
          actor.id,
          digest,
          randomUUID(),
          encoded,
          bytes,
          input.expiresIn,
        ],
      )
    ).rows[0];
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "waho-transfer-codes",
    ]);
    const count = (
      await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM " +
          table("transfer_code") +
          " WHERE expires_at>now()",
        [],
      )
    ).rows[0];
    if (Number(count.n) >= 10000) throw new UserDataError("code_capacity", 503);
    for (let n = 0; n < 20 && !row.code; n++) {
      const code = String(randomInt(1000000)).padStart(6, "0"),
        result = await db.query(
          "INSERT INTO " +
            table("transfer_code") +
            "(code,transfer_id,expires_at,reusable_after) VALUES($1,$2,now()+interval '10 minutes',now()+interval '30 minutes') ON CONFLICT(code) DO UPDATE SET transfer_id=EXCLUDED.transfer_id,expires_at=EXCLUDED.expires_at,reusable_after=EXCLUDED.reusable_after WHERE " +
            table("transfer_code") +
            ".reusable_after<now() RETURNING code",
          [code, row.id],
        );
      if (result.rows.length) row.code = code;
    }
    if (!row.code) throw new UserDataError("code_capacity", 503);
    await db.query("COMMIT");
    return created(row, actor, digest);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function requestTransfer(actor: Actor, raw: unknown) {
  const { code } = transferRequestSchema.parse(raw);
  if (!actor.id) throw new UserDataError("unauthorized", 401);
  await checkBudget("transfer-code", actor.id, 60, 5);
  await checkBudget("transfer-code-global", "all", 60, 300);
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const row = live(
      (
        await db.query<Transfer>(
          "SELECT t.* FROM " +
            table("transfer") +
            " t JOIN " +
            table("transfer_code") +
            " c ON c.transfer_id=t.id WHERE c.code=$1 AND c.expires_at>now() FOR UPDATE OF t",
          [code],
        )
      ).rows[0],
    );
    const prior = (
      await db.query(
        "SELECT id,challenge FROM " +
          table("transfer_pair") +
          " WHERE transfer_id=$1 AND recipient_id=$2 AND expires_at>now()",
        [row.id, actor.id],
      )
    ).rows[0];
    if (prior) {
      await db.query("COMMIT");
      return { id: row.id, pairId: prior.id, challenge: prior.challenge };
    }
    const q = (
      await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM " +
          table("transfer_pair") +
          " WHERE transfer_id=$1 AND expires_at>now()",
        [row.id],
      )
    ).rows[0];
    if (Number(q.n) >= 3) throw new UserDataError("busy", 409);
    const id = randomUUID(),
      challenge = String(randomInt(1000000)).padStart(6, "0");
    await db.query(
      "INSERT INTO " +
        table("transfer_pair") +
        "(id,transfer_id,recipient_id,challenge,expires_at) VALUES($1,$2,$3,$4,least($5::timestamptz,now()+interval '10 minutes')) ON CONFLICT(transfer_id,recipient_id) DO UPDATE SET id=EXCLUDED.id,challenge=EXCLUDED.challenge,expires_at=EXCLUDED.expires_at,approved_at=NULL",
      [id, row.id, actor.id, challenge, row.expires_at],
    );
    await db.query("COMMIT");
    return { id: row.id, pairId: id, challenge };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function transferAction(actor: Actor, id: string, raw: unknown) {
  z.uuid().parse(id);
  const input = transferActionSchema.parse(raw);
  if (!actor.id) throw new UserDataError("unauthorized", 401);
  await checkBudget("transfer-action", actor.id, 60, 90);
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const stored = (
      await db.query<Transfer>(
        "SELECT * FROM " + table("transfer") + " WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!stored) throw new UserDataError("not_available", 404);
    const owner = actor.owners.includes(stored.owner_id);
    if (input.action === "revoke") {
      if (!owner) throw new UserDataError("not_available", 404);
      await db.query(
        "UPDATE " +
          table("transfer") +
          " SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1",
        [id],
      );
      await db.query("COMMIT");
      return { revoked: true };
    }
    if (input.action === "ack") {
      if (
        stored.claimed_by !== actor.id ||
        !matches(input.claim, token(stored, "claim"))
      )
        throw new UserDataError("not_available", 404);
      if (stored.revoked_at) throw new UserDataError("not_available", 404);
      await db.query(
        "UPDATE " +
          table("transfer") +
          " SET completed_at=coalesce(completed_at,now()) WHERE id=$1",
        [id],
      );
      await db.query("COMMIT");
      return { completed: true };
    }
    const row = live(stored);
    if (input.action === "approve") {
      if (!owner || !input.pairId)
        throw new UserDataError("not_available", 404);
      const pair = (
        await db.query(
          "SELECT * FROM " +
            table("transfer_pair") +
            " WHERE id=$1 AND transfer_id=$2 AND expires_at>now()",
          [input.pairId, id],
        )
      ).rows[0];
      if (!pair) throw new UserDataError("not_available", 404);
      if (
        pair.approved_at &&
        row.claimed_by === pair.recipient_id &&
        row.claim_seed
      ) {
        await db.query("COMMIT");
        return { approved: true };
      }
      if (
        row.claimed_by &&
        row.claimed_by !== pair.recipient_id &&
        row.lease_until &&
        new Date(row.lease_until).getTime() > Date.now()
      )
        throw new UserDataError("claimed", 409);
      await db.query(
        "UPDATE " +
          table("transfer_pair") +
          " SET approved_at=NULL WHERE transfer_id=$1 AND id<>$2",
        [id, pair.id],
      );
      await db.query(
        "UPDATE " +
          table("transfer_pair") +
          " SET approved_at=now() WHERE id=$1",
        [pair.id],
      );
      await db.query(
        "UPDATE " +
          table("transfer") +
          " SET claimed_by=$2,claim_seed=$3,lease_until=least(expires_at,now()+interval '15 minutes') WHERE id=$1",
        [id, pair.recipient_id, randomUUID()],
      );
      await db.query("COMMIT");
      return { approved: true };
    }
    const pair = input.pairId
      ? (
          await db.query(
            "SELECT approved_at FROM " +
              table("transfer_pair") +
              " WHERE id=$1 AND transfer_id=$2 AND recipient_id=$3 AND expires_at>now()",
            [input.pairId, id, actor.id],
          )
        ).rows[0]
      : null;
    const link = matches(input.capability, token(row));
    if (!owner && !link && !pair) throw new UserDataError("not_available", 404);
    if (input.action === "status") {
      await db.query("COMMIT");
      return {
        approved: !!pair?.approved_at,
        available:
          !row.claimed_by ||
          row.claimed_by === actor.id ||
          !row.lease_until ||
          new Date(row.lease_until).getTime() <= Date.now(),
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    }
    if (!link && !pair?.approved_at)
      throw new UserDataError("approval_required", 403);
    if (
      row.claimed_by &&
      row.claimed_by !== actor.id &&
      row.lease_until &&
      new Date(row.lease_until).getTime() > Date.now()
    )
      throw new UserDataError("claimed", 409);
    if (row.claimed_by !== actor.id || !row.claim_seed) {
      row.claimed_by = actor.id;
      row.claim_seed = randomUUID();
    }
    await db.query(
      "UPDATE " +
        table("transfer") +
        " SET claimed_by=$2,claim_seed=$3,lease_until=least(expires_at,now()+interval '15 minutes') WHERE id=$1",
      [id, actor.id, row.claim_seed],
    );
    await db.query("COMMIT");
    return {
      id,
      snapshot: row.snapshot,
      claim: token(row, "claim"),
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function listTransfers(actor: Actor) {
  if (!actor.owners.length) return [];
  const rows = (
    await queryDatabase<
      Transfer & {
        pairs: { id: string; challenge: string; approved: boolean }[];
      }
    >(
      "SELECT t.*,coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'challenge',p.challenge,'approved',p.approved_at IS NOT NULL)) FROM " +
        table("transfer_pair") +
        " p WHERE p.transfer_id=t.id AND p.expires_at>now()),'[]'::jsonb) AS pairs,(SELECT code FROM " +
        table("transfer_code") +
        " c WHERE c.transfer_id=t.id AND c.expires_at>now() LIMIT 1) AS code FROM " +
        table("transfer") +
        " t WHERE owner_id=ANY($1::text[]) AND expires_at>now() AND revoked_at IS NULL AND completed_at IS NULL ORDER BY created_at DESC LIMIT 20",
      [actor.owners],
    )
  ).rows;
  return rows.map((row) => ({
    id: row.id,
    title: row.snapshot.title,
    items: row.snapshot.items.length,
    capability: token(row),
    code: row.code ?? null,
    expiresAt: new Date(row.expires_at).toISOString(),
    pairs: row.pairs,
  }));
}

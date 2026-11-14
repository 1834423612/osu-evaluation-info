import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabasePool, queryDatabase } from "../db.ts";
import {
  publicSnapshot,
  snapshotSchema,
  type SavedSnapshot,
} from "../saved/exchange.ts";
import { userDataTable } from "./namespace.ts";
import { privateDigest, checkBudget } from "./rate-limit.ts";
import { UserDataError } from "./http.ts";
import type { Actor } from "./principal.ts";
export const shareCreateSchema = z.object({
  snapshot: snapshotSchema,
  requestId: z.uuid().optional(),
  visibility: z.enum(["public", "link"]).default("link"),
  expiresIn: z.number().int().min(900).max(2592000).default(604800),
});
export const shareIdSchema = z.uuid();
export const shareReadSchema = z.object({
  id: shareIdSchema,
  capability: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
});
type ShareRow = {
  id: string;
  owner_id: string;
  title: string;
  snapshot: SavedSnapshot;
  visibility: "public" | "link";
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
};
type CreatedRow = ShareRow & {
  capability_seed: string | null;
  request_digest: string | null;
  code?: string | null;
};
function issuedToken(id: string, owner: string, seed: string, purpose: string) {
  return Buffer.from(
    privateDigest(id + ":" + owner + ":" + seed, purpose),
    "hex",
  ).toString("base64url");
}
function createdResult(row: CreatedRow, digest: string, owner: string) {
  if (
    row.owner_id !== owner ||
    row.request_digest !== digest ||
    !row.capability_seed ||
    row.revoked_at ||
    new Date(row.expires_at).getTime() <= Date.now()
  )
    throw new UserDataError("request_conflict", 409);
  return {
    id: row.id,
    capability:
      row.visibility === "link"
        ? issuedToken(row.id, owner, row.capability_seed, "share-issued-link")
        : null,
    management: issuedToken(
      row.id,
      owner,
      "management",
      "share-issued-management",
    ),
    code: row.code ?? null,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function createShare(
  actor: Actor,
  input: z.infer<typeof shareCreateSchema>,
) {
  if (!actor.id) throw new UserDataError("unauthorized", 401);
  const snapshot = publicSnapshot(input.snapshot),
    encoded = JSON.stringify(snapshot),
    bytes = Buffer.byteLength(encoded);
  if (bytes > 1048576) throw new UserDataError("too_large", 413);
  const id = input.requestId ?? randomUUID(),
    digest = privateDigest(
      JSON.stringify({
        snapshot,
        visibility: input.visibility,
        expiresIn: input.expiresIn,
      }),
      "share-request",
    );
  const lookup =
    "SELECT s.*,(SELECT code FROM " +
    userDataTable("share_code") +
    " c WHERE c.share_id=s.id AND c.expires_at>now() LIMIT 1) AS code FROM " +
    userDataTable("shared_collection") +
    " s WHERE s.id=$1";
  const previous = await queryDatabase<CreatedRow>(lookup, [id]);
  if (previous.rows[0])
    return createdResult(previous.rows[0], digest, actor.id);
  await checkBudget("share-create", actor.id, 86400, 20);
  const seed = randomUUID(),
    capability = issuedToken(id, actor.id, seed, "share-issued-link"),
    management = issuedToken(
      id,
      actor.id,
      "management",
      "share-issued-management",
    ),
    expiresAt = new Date(Date.now() + input.expiresIn * 1000);
  const db = await getDatabasePool().connect();
  let code: string | null = null;
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "share:" + actor.id,
    ]);
    const existing = await db.query<CreatedRow>(lookup, [id]);
    if (existing.rows[0]) {
      const value = createdResult(existing.rows[0], digest, actor.id);
      await db.query("COMMIT");
      return value;
    }
    const quota = await db.query<{ n: string; bytes: string }>(
      "SELECT count(*) AS n,coalesce(sum(bytes),0) AS bytes FROM " +
        userDataTable("shared_collection") +
        " WHERE owner_id=$1 AND revoked_at IS NULL AND expires_at>now()",
      [actor.id],
    );
    if (
      Number(quota.rows[0].n) >= 20 ||
      Number(quota.rows[0].bytes) + bytes > 10485760
    )
      throw new UserDataError("quota", 409);
    await db.query(
      "INSERT INTO " +
        userDataTable("shared_collection") +
        "(id,owner_id,title,snapshot,bytes,visibility,capability_digest,management_digest,expires_at,capability_seed,request_digest) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)",
      [
        id,
        actor.id,
        snapshot.title,
        encoded,
        bytes,
        input.visibility,
        privateDigest(capability, "share"),
        privateDigest(management, "share-management"),
        expiresAt,
        seed,
        digest,
      ],
    );
    if (input.visibility === "public") {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "waho-public-code-allocation",
      ]);
      const active = await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM " +
          userDataTable("share_code") +
          " WHERE expires_at>now()",
      );
      if (Number(active.rows[0].n) >= 10000)
        throw new UserDataError("code_capacity", 503);
      for (let i = 0; i < 10 && !code; i++) {
        const candidate = String(randomInt(1000000)).padStart(6, "0");
        const r = await db.query(
          "INSERT INTO " +
            userDataTable("share_code") +
            "(code,share_id,expires_at,reusable_after) VALUES($1,$2,least($3::timestamptz,now()+interval '24 hours'),least($3::timestamptz,now()+interval '24 hours')+interval '24 hours') ON CONFLICT(code) DO UPDATE SET share_id=EXCLUDED.share_id,expires_at=EXCLUDED.expires_at,reusable_after=EXCLUDED.reusable_after WHERE " +
            userDataTable("share_code") +
            ".reusable_after<now() RETURNING code",
          [candidate, id, expiresAt],
        );
        if (r.rows.length) code = candidate;
      }
      if (!code) throw new UserDataError("code_capacity", 503);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
  return {
    id,
    capability: input.visibility === "link" ? capability : null,
    management,
    code,
    expiresAt: expiresAt.toISOString(),
  };
}
export async function readShare(
  id: string,
  capability?: string,
  owners: string[] = [],
): Promise<ShareRow> {
  const r = await queryDatabase<ShareRow>(
    "SELECT id,owner_id,title,snapshot,visibility,created_at,expires_at,revoked_at FROM " +
      userDataTable("shared_collection") +
      " WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() AND (visibility='public' OR (owner_id=ANY($3::text[]) AND $2='') OR capability_digest=$2)",
    [id, capability ? privateDigest(capability, "share") : "", owners],
  );
  if (!r.rows[0]) throw new UserDataError("not_found", 404);
  return r.rows[0];
}
export async function resolveShareCode(code: string) {
  await checkBudget("code-read", "all", 60, 600);
  const r = await queryDatabase<{ id: string }>(
    "SELECT s.id FROM " +
      userDataTable("share_code") +
      " c JOIN " +
      userDataTable("shared_collection") +
      " s ON s.id=c.share_id WHERE c.code=$1 AND c.expires_at>now() AND s.visibility='public' AND s.revoked_at IS NULL AND s.expires_at>now()",
    [code],
  );
  if (!r.rows[0]) throw new UserDataError("not_found", 404);
  return r.rows[0];
}
export async function recordShareEvent(
  id: string,
  action: "preview" | "open" | "import",
  actorId: string | null,
  key: string,
  itemCount = 0,
  source: "browser" | "bot" | "unknown" = "browser",
) {
  const eventKey = privateDigest(id + ":" + action + ":" + key, "share-event");
  await queryDatabase(
    "INSERT INTO " +
      userDataTable("share_event") +
      "(event_key,share_id,action,principal_id,item_count,source) SELECT $1,id,$3,$4,$5,$6 FROM " +
      userDataTable("shared_collection") +
      " WHERE id=$2 AND revoked_at IS NULL AND expires_at>now() ON CONFLICT DO NOTHING",
    [eventKey, id, action, actorId, itemCount, source],
  );
}
export async function listShares(owners: string[]) {
  if (!owners.length) return [];
  const r = await queryDatabase(
    "SELECT s.id,s.title,s.visibility,s.created_at,s.expires_at,s.revoked_at,c.code,c.expires_at AS code_expires_at,count(e.event_key) FILTER(WHERE e.action='preview')::int AS previews,count(e.event_key) FILTER(WHERE e.action='open')::int AS opens,count(e.event_key) FILTER(WHERE e.action='import')::int AS imports FROM " +
      userDataTable("shared_collection") +
      " s LEFT JOIN " +
      userDataTable("share_code") +
      " c ON c.share_id=s.id AND c.reusable_after>now() LEFT JOIN " +
      userDataTable("share_event") +
      " e ON e.share_id=s.id WHERE s.owner_id=ANY($1::text[]) GROUP BY s.id,c.code,c.expires_at ORDER BY s.created_at DESC LIMIT 50",
    [owners],
  );
  return r.rows;
}
export async function manageShare(
  actor: Actor,
  id: string,
  action: "revoke" | "rotate" | "copy",
  management?: string,
) {
  const r = await queryDatabase<CreatedRow>(
    "SELECT * FROM " +
      userDataTable("shared_collection") +
      " WHERE id=$1 AND (owner_id=ANY($2::text[]) OR management_digest=$3) AND revoked_at IS NULL",
    [
      id,
      actor.owners,
      management ? privateDigest(management, "share-management") : "",
    ],
  );
  const row = r.rows[0];
  if (!row) throw new UserDataError("not_found", 404);
  if (action === "revoke") {
    await queryDatabase(
      "UPDATE " +
        userDataTable("shared_collection") +
        " SET revoked_at=now() WHERE id=$1",
      [id],
    );
    return {
      id,
      visibility: row.visibility,
      expires_at: row.expires_at,
      capability: null,
    };
  }
  if (
    new Date(row.expires_at).getTime() <= Date.now() ||
    row.visibility !== "link"
  )
    throw new UserDataError("not_found", 404);
  let seed = row.capability_seed;
  if (action === "rotate") {
    seed = randomUUID();
    const capability = issuedToken(id, row.owner_id, seed, "share-issued-link");
    const changed = await queryDatabase(
      "UPDATE " +
        userDataTable("shared_collection") +
        " SET capability_seed=$2,capability_digest=$4 WHERE id=$1 AND capability_seed IS NOT DISTINCT FROM $3::uuid AND revoked_at IS NULL RETURNING id",
      [id, seed, row.capability_seed, privateDigest(capability, "share")],
    );
    if (!changed.rows.length) throw new UserDataError("conflict", 409);
  }
  if (!seed) throw new UserDataError("replace_link", 409);
  return {
    id,
    visibility: row.visibility,
    expires_at: row.expires_at,
    capability: issuedToken(id, row.owner_id, seed, "share-issued-link"),
  };
}

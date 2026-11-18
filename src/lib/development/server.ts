import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { privateDigest, checkBudget } from "../user-data/rate-limit.ts";
import { UserDataError } from "../user-data/http.ts";
import {
  accountSnapshotSchema,
  mergeAccountContent,
  content,
  type AccountSnapshot,
} from "./model.ts";
import { readAccountSnapshot, writeAccountSnapshot } from "./accounts.ts";
import { getAuthPool } from "../auth/database.ts";
import { authTablePrefix } from "../auth/config.ts";
export const pairingSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
  );
export function productionOrigin(env: NodeJS.ProcessEnv = process.env) {
  const value = env.DEVELOPMENT_PRODUCTION_ORIGIN || env.SITE_URL;
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname === "localhost" ||
    /^[\d.:\[\]]+$/.test(url.hostname)
  )
    return null;
  return url.origin;
}
const encryptionKey = () =>
  Buffer.from(privateDigest("development-link", "encryption"), "hex");
function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString(
    "base64url",
  );
}
function decrypt(value: string) {
  const bytes = Buffer.from(value, "base64url"),
    cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      bytes.subarray(0, 12),
    );
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    cipher.update(bytes.subarray(12, -16)),
    cipher.final(),
  ]).toString("utf8");
}
export async function issueDevelopmentGrant(accountId: string, label: string) {
  await checkBudget("development-grant", accountId, 3600, 10);
  const id = randomUUID(),
    secret = randomBytes(32).toString("base64url"),
    db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "development:" + accountId,
    ]);
    const count = await db.query(
      `SELECT count(*) AS n FROM ${table("development_grant")} WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>now()`,
      [accountId],
    );
    if (Number(count.rows[0].n) >= 5) throw new UserDataError("quota", 409);
    await db.query(
      `INSERT INTO ${table("development_grant")}(id,account_id,display_label,token_digest,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 days')`,
      [
        id,
        accountId,
        label.slice(0, 80),
        privateDigest(secret, "development-grant"),
      ],
    );
    await db.query("COMMIT");
    return { id, pairing: `${id}.${secret}` };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function authenticateDevelopmentGrant(request: Request) {
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");
  if (!provided || !pairingSchema.safeParse(provided).success)
    throw new UserDataError("unauthorized", 401);
  const [id, secret] = provided.split("."),
    row = (
      await getDatabasePool().query(
        `SELECT account_id,display_label,token_digest FROM ${table("development_grant")} WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()`,
        [id],
      )
    ).rows[0];
  if (
    !row ||
    !timingSafeEqual(
      Buffer.from(row.token_digest),
      Buffer.from(privateDigest(secret, "development-grant")),
    )
  )
    throw new UserDataError("unauthorized", 401);
  const owner = await getAuthPool().query(
    `SELECT id FROM "${authTablePrefix()}user" WHERE id=$1 AND "emailVerified"=true`,
    [row.account_id],
  );
  if (!owner.rows.length) throw new UserDataError("unauthorized", 401);
  await checkBudget("development-remote", row.account_id, 60, 20);
  return {
    accountId: row.account_id as string,
    label: row.display_label as string,
  };
}
type LinkRow = {
  account_id: string;
  remote_account_id: string;
  display_label: string;
  token_cipher: string;
  base: AccountSnapshot;
  conflicts: string[];
  pulled_at: string;
};
async function link(accountId: string) {
  return (
    await getDatabasePool().query(
      `SELECT * FROM ${table("development_link")} WHERE account_id=$1`,
      [accountId],
    )
  ).rows[0] as LinkRow | undefined;
}
async function remote(pairing: string, body?: unknown) {
  const origin = productionOrigin();
  if (!origin) throw new UserDataError("production_origin", 503);
  const response = await fetch(origin + "/api/account/development/remote", {
    method: body ? "PUT" : "GET",
    redirect: "error",
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + pairing,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body
      ? {
          body: JSON.stringify({
            encoding: "gzip",
            data: gzipSync(Buffer.from(JSON.stringify(body))).toString(
              "base64url",
            ),
          }),
        }
      : {}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new UserDataError(
      response.status === 409 ? "preview_outdated" : "production_unavailable",
      response.status === 409 ? 409 : 503,
    );
  // Bound response bytes before parsing the private snapshot.
  const reader = response.body?.getReader();
  if (!reader) throw new UserDataError("production_unavailable", 503);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 16 * 1024 * 1024) {
        await reader.cancel();
        throw new UserDataError("too_large", 413);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return accountSnapshotSchema.parse(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
}
export async function developmentStatus(accountId: string) {
  const development = process.env.NODE_ENV !== "production";
  const current = development ? await link(accountId) : undefined;
  const grants = (
    await getDatabasePool().query(
      `SELECT id,created_at,expires_at FROM ${table("development_grant")} WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC`,
      [accountId],
    )
  ).rows;
  return {
    development,
    configured: !!productionOrigin(),
    productionOrigin: productionOrigin(),
    linked: !!current,
    label: current?.display_label ?? "",
    pulledAt: current?.pulled_at ?? null,
    conflicts: current?.conflicts ?? [],
    grants,
  };
}
export async function bindDevelopment(accountId: string, pairing: string) {
  if (process.env.NODE_ENV === "production")
    throw new UserDataError("development_only", 403);
  pairingSchema.parse(pairing);
  const snapshot = await remote(pairing);
  await getDatabasePool().query(
    `INSERT INTO ${table("development_link")}(account_id,remote_account_id,display_label,token_cipher,base,pulled_at) VALUES($1,$2,$3,$4,$5,'1970-01-01') ON CONFLICT(account_id) DO UPDATE SET remote_account_id=excluded.remote_account_id,display_label=excluded.display_label,token_cipher=excluded.token_cipher,base=excluded.base,conflicts='[]',pulled_at=excluded.pulled_at,updated_at=now()`,
    [
      accountId,
      snapshot.accountId,
      snapshot.label || "Production account",
      encrypt(pairing),
      JSON.stringify({ ...snapshot, planning: null, favorites: [] }),
    ],
  );
  return pullDevelopment(accountId, true);
}
export async function pullDevelopment(accountId: string, force = false) {
  if (process.env.NODE_ENV === "production")
    return { development: false, linked: false };
  const current = await link(accountId);
  if (!current) return { development: true, linked: false };
  if (!force && Date.now() - new Date(current.pulled_at).getTime() < 60000)
    return { development: true, linked: true };
  const production = await remote(decrypt(current.token_cipher));
  if (production.accountId !== current.remote_account_id)
    throw new UserDataError("account_changed", 409);
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    const live = (
      await db.query(
        `SELECT * FROM ${table("development_link")} WHERE account_id=$1 FOR UPDATE`,
        [accountId],
      )
    ).rows[0] as LinkRow | undefined;
    if (!live || live.token_cipher !== current.token_cipher)
      throw new UserDataError("account_changed", 409);
    if (
      live.base.cursor > production.cursor ||
      live.base.planningVersion > production.planningVersion
    ) {
      await db.query("COMMIT");
      return { development: true, linked: true };
    }
    const local = await readAccountSnapshot(accountId, db),
      merged = mergeAccountContent(
        content(live.base),
        content(local),
        content(production),
      );
    await writeAccountSnapshot(accountId, local, merged.value, db);
    await db.query(
      `UPDATE ${table("development_link")} SET base=$2,conflicts=$3,pulled_at=now(),updated_at=now() WHERE account_id=$1`,
      [
        accountId,
        JSON.stringify(merged.conflicts.length ? live.base : production),
        JSON.stringify(merged.conflicts),
      ],
    );
    await db.query("COMMIT");
    return { development: true, linked: true, conflicts: merged.conflicts };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function previewProductionMerge(accountId: string) {
  if (process.env.NODE_ENV === "production")
    throw new UserDataError("development_only", 403);
  const current = await link(accountId);
  if (!current) throw new UserDataError("not_linked", 409);
  const local = await readAccountSnapshot(accountId),
    production = await remote(decrypt(current.token_cipher));
  if (production.accountId !== current.remote_account_id)
    throw new UserDataError("account_changed", 409);
  const merged = mergeAccountContent(
    content(current.base),
    content(local),
    content(production),
  );
  const preview = privateDigest(
    JSON.stringify([local, production, merged.value]),
    "development-preview",
  );
  return {
    preview,
    conflicts: merged.conflicts,
    value: merged.value,
    expected: production,
    local,
    current,
  };
}
export async function pushProductionMerge(accountId: string, preview: string) {
  const proposed = await previewProductionMerge(accountId);
  if (proposed.conflicts.length) throw new UserDataError("merge_conflict", 409);
  if (preview !== proposed.preview)
    throw new UserDataError("preview_outdated", 409);
  await remote(decrypt(proposed.current.token_cipher), {
    expected: {
      planningVersion: proposed.expected.planningVersion,
      cursor: proposed.expected.cursor,
    },
    next: proposed.value,
  });
  await getDatabasePool().query(
    // Keep the common ancestor until pull reconciles the merged result with
    // the latest local state. Advancing only base would turn stale local fields
    // into new edits and revert production-only changes on the next push.
    `UPDATE ${table("development_link")} SET pulled_at='1970-01-01',updated_at=now() WHERE account_id=$1 AND token_cipher=$2`,
    [accountId, proposed.current.token_cipher],
  );
  return { merged: true };
}

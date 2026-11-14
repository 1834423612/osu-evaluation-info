import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "./namespace.ts";
import { privateDigest, checkBudget } from "./rate-limit.ts";
import { UserDataError } from "./http.ts";
import { itemKey } from "../saved/exchange.ts";
import {
  sameItem,
  syncRequestSchema,
  type SyncRecord,
  type SyncReceipt,
  type SyncResponse,
} from "../sync/protocol.ts";
type Stored = { key: string; version: string; item: SyncRecord["item"] };
function record(row: Stored): SyncRecord {
  return { ...row, version: Number(row.version) };
}
export async function exchangeSync(
  accountId: string,
  input: unknown,
): Promise<SyncResponse> {
  if (!accountId || accountId.length > 100)
    throw new UserDataError("unauthorized", 401);
  const request = syncRequestSchema.parse(input);
  if (
    new Set(request.operations.map((x) => x.id)).size !==
    request.operations.length
  )
    throw new UserDataError("duplicate_operation", 400);
  await checkBudget("sync", accountId, 60, 120);
  const db = await getDatabasePool().connect(),
    owner = "u:" + accountId;
  try {
    await db.query("BEGIN");
    await db.query(
      "INSERT INTO " +
        table("sync_state") +
        "(owner_id) VALUES($1) ON CONFLICT DO NOTHING",
      [owner],
    );
    const state = (
      await db.query<{ sequence: string; floor: string }>(
        "SELECT sequence,floor FROM " +
          table("sync_state") +
          " WHERE owner_id=$1 FOR UPDATE",
        [owner],
      )
    ).rows[0];
    let sequence = Number(state.sequence);
    const floor = Number(state.floor);
    if (request.cursor > sequence) throw new UserDataError("cursor", 409);
    const reset = request.cursor < floor,
      receipts: SyncReceipt[] = [];
    // An expired device must reconcile before retrying any old operations.
    for (const op of reset ? [] : request.operations) {
      const digest = privateDigest(
        JSON.stringify({ key: op.key, base: op.base, item: op.item }),
        "sync-operation",
      );
      const previous = (
        await db.query<{ digest: string; result: SyncReceipt }>(
          "SELECT digest,result FROM " +
            table("sync_receipt") +
            " WHERE owner_id=$1 AND operation_id=$2",
          [owner, op.id],
        )
      ).rows[0];
      if (previous) {
        if (previous.digest !== digest)
          throw new UserDataError("operation_reused", 409);
        receipts.push(previous.result);
        continue;
      }
      const row = (
        await db.query<Stored>(
          "SELECT key,version,item FROM " +
            table("sync_item") +
            " WHERE owner_id=$1 AND key=$2",
          [owner, op.key],
        )
      ).rows[0];
      let current: SyncRecord = row
        ? record(row)
        : { key: op.key, version: 0, item: null };
      let status: SyncReceipt["status"] = "applied";
      if (op.base !== current.version && !sameItem(op.item, current.item))
        status = "conflict";
      else if (!sameItem(op.item, current.item) || !row) {
        current = { key: op.key, version: ++sequence, item: op.item };
        await db.query(
          "INSERT INTO " +
            table("sync_item") +
            "(owner_id,key,version,item) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner_id,key) DO UPDATE SET version=EXCLUDED.version,item=EXCLUDED.item,updated_at=now()",
          [
            owner,
            op.key,
            sequence,
            op.item === null ? null : JSON.stringify(op.item),
          ],
        );
      }
      const receipt: SyncReceipt = { id: op.id, status, record: current };
      receipts.push(receipt);
      await db.query(
        "INSERT INTO " +
          table("sync_receipt") +
          "(owner_id,operation_id,digest,result) VALUES($1,$2,$3,$4::jsonb)",
        [owner, op.id, digest, JSON.stringify(receipt)],
      );
    }
    const quota = (
      await db.query<{ kind: string; n: string; bytes: string }>(
        "SELECT item->>'kind' AS kind,count(*) AS n,sum(octet_length(item::text)) AS bytes FROM " +
          table("sync_item") +
          " WHERE owner_id=$1 AND item IS NOT NULL GROUP BY item->>'kind'",
        [owner],
      )
    ).rows;
    if (
      quota.some((x) => Number(x.n) > (x.kind === "course" ? 100 : 200)) ||
      quota.reduce((n, x) => n + Number(x.bytes), 0) > 10485760
    )
      throw new UserDataError("quota", 409);
    await db.query(
      "UPDATE " + table("sync_state") + " SET sequence=$2 WHERE owner_id=$1",
      [owner, sequence],
    );
    const rows = (
      await db.query<Stored>(
        "SELECT key,version,item FROM " +
          table("sync_item") +
          " WHERE owner_id=$1 AND version>$2 ORDER BY version,key",
        [owner, reset ? 0 : request.cursor],
      )
    ).rows.map(record);
    // Validate stored identities too; corrupted state cannot erase local data.
    for (const row of rows)
      if (row.item && itemKey(row.item) !== row.key)
        throw new UserDataError("invalid_state", 503);
    await db.query("COMMIT");
    return {
      accountId,
      cursor: sequence,
      floor,
      reset,
      records: rows,
      receipts,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

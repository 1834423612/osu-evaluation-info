import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { UserDataError } from "../user-data/http.ts";
import { readPlanningBackup, writePlanningBackup } from "../planning/cloud.ts";
import { exchangeSync } from "../user-data/sync.ts";
import { syncItemKey } from "../sync/items.ts";
import { sameItem } from "../sync/protocol.ts";
import {
  accountSnapshotSchema,
  type AccountSnapshot,
  type AccountContent,
} from "./model.ts";

export async function readAccountSnapshot(
  accountId: string,
  db: Pick<PoolClient, "query"> = getDatabasePool(),
): Promise<AccountSnapshot> {
  const planning = await readPlanningBackup(accountId, db),
    owner = "u:" + accountId;
  const state = (
    await db.query(
      `SELECT sequence FROM ${table("sync_state")} WHERE owner_id=$1`,
      [owner],
    )
  ).rows[0];
  const records = await db.query(
    `SELECT item FROM ${table("sync_item")} WHERE owner_id=$1 AND item IS NOT NULL ORDER BY key`,
    [owner],
  );
  return accountSnapshotSchema.parse({
    accountId,
    planningVersion: planning.version,
    cursor: Number(state?.sequence ?? 0),
    planning: planning.plan,
    favorites: records.rows.map((row) => row.item),
  });
}
/** Lock both domains before checking the preview versions; all writes commit together. */
export async function writeAccountSnapshot(
  accountId: string,
  expected: Pick<AccountSnapshot, "planningVersion" | "cursor">,
  next: AccountContent,
  connection?: PoolClient,
) {
  const db = connection ?? (await getDatabasePool().connect()),
    owner = "u:" + accountId;
  try {
    if (!connection) await db.query("BEGIN");
    await db.query(
      `INSERT INTO ${table("planning_backup")}(account_id) VALUES($1) ON CONFLICT DO NOTHING`,
      [accountId],
    );
    await db.query(
      `SELECT version FROM ${table("planning_backup")} WHERE account_id=$1 FOR UPDATE`,
      [accountId],
    );
    await db.query(
      `INSERT INTO ${table("sync_state")}(owner_id) VALUES($1) ON CONFLICT DO NOTHING`,
      [owner],
    );
    await db.query(
      `SELECT sequence FROM ${table("sync_state")} WHERE owner_id=$1 FOR UPDATE`,
      [owner],
    );
    const current = await readAccountSnapshot(accountId, db);
    if (
      current.planningVersion !== expected.planningVersion ||
      current.cursor !== expected.cursor
    )
      throw new UserDataError("preview_outdated", 409);
    await writePlanningBackup(
      accountId,
      current.planningVersion,
      next.planning,
      db,
    );
    const stored = await db.query(
      `SELECT key,version,item FROM ${table("sync_item")} WHERE owner_id=$1`,
      [owner],
    );
    const before = new Map(stored.rows.map((row) => [row.key, row])),
      after = new Map(next.favorites.map((item) => [syncItemKey(item), item]));
    const operations = [
      ...new Set([...before.keys(), ...after.keys()]),
    ].flatMap((key) => {
      const item = after.get(key) ?? null,
        row = before.get(key);
      return sameItem(row?.item ?? null, item)
        ? []
        : [{ id: randomUUID(), key, base: Number(row?.version ?? 0), item }];
    });
    let cursor = current.cursor;
    for (let offset = 0; offset < operations.length; offset += 100) {
      const result = await exchangeSync(
        accountId,
        { cursor, operations: operations.slice(offset, offset + 100) },
        db,
      );
      if (result.receipts.some((receipt) => receipt.status !== "applied"))
        throw new UserDataError("preview_outdated", 409);
      cursor = result.cursor;
    }
    const result = await readAccountSnapshot(accountId, db);
    if (!connection) await db.query("COMMIT");
    return result;
  } catch (error) {
    if (!connection) await db.query("ROLLBACK");
    throw error;
  } finally {
    if (!connection) db.release();
  }
}

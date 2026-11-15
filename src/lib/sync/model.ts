import { syncItemKey as itemKey, type SyncItem } from "./items.ts";
import {
  sameItem,
  type SyncRecord,
  type SyncResponse,
  type SyncOperation,
} from "./protocol.ts";
export type SyncConflict = {
  key: string;
  local: SyncItem | null;
  remote: SyncRecord;
};
export type SyncState = {
  version: 1;
  accountId: string;
  enabled: boolean;
  initialized: boolean;
  once: boolean;
  cursor: number;
  baseline: Record<string, SyncRecord>;
  seen: Record<string, SyncItem | null>;
  outbox: SyncOperation[];
  conflicts: SyncConflict[];
  needsReview: boolean;
  lastSyncAt: string | null;
  problem?: "offline" | "unavailable" | "unauthorized" | "quota";
  lease?: { id: string; until: number };
};
export function newSyncState(accountId: string): SyncState {
  return {
    version: 1,
    accountId,
    enabled: false,
    initialized: false,
    once: false,
    cursor: 0,
    baseline: {},
    seen: {},
    outbox: [],
    conflicts: [],
    needsReview: false,
    lastSyncAt: null,
  };
}
/** Called only after the user confirms the merge preview. */
export function initializeMerge(
  state: SyncState,
  response: SyncResponse,
  items: SyncItem[],
  uuid: () => string,
) {
  if (response.accountId !== state.accountId)
    throw new Error("account_changed");
  const live = new Map(items.map((x) => [itemKey(x), x])),
    hadHistory = state.initialized,
    expiredHistory = response.floor > 0,
    rows = new Map(response.records.map((x) => [x.key, x]));
  state.baseline = Object.fromEntries(rows);
  state.seen = Object.fromEntries(
    [...rows].map(([key, row]) => [key, row.item]),
  );
  state.outbox = [];
  state.conflicts = [];
  for (const key of new Set([
    ...rows.keys(),
    ...(hadHistory || expiredHistory ? [...live.keys()] : []),
  ])) {
    const remote = rows.get(key) ?? { key, version: 0, item: null },
      own = live.get(key) ?? null;
    if (sameItem(own, remote.item)) continue;
    if (
      (own && (rows.has(key) || hadHistory || expiredHistory)) ||
      (hadHistory && !own && remote.item)
    ) {
      state.conflicts.push({ key, local: own, remote });
      continue;
    }
    if (remote.item) live.set(key, remote.item);
  }
  state.initialized = true;
  state.enabled = true;
  state.needsReview = false;
  state.cursor = response.cursor;
  const merged = [...live.values()];
  captureChanges(state, merged, uuid);
  return merged;
}
export function captureChanges(
  state: SyncState,
  items: SyncItem[],
  uuid: () => string,
) {
  const live = new Map(items.map((x) => [itemKey(x), x]));
  const pending = new Set([
    ...state.outbox.map((x) => x.key),
    ...state.conflicts.map((x) => x.key),
  ]);
  for (const conflict of state.conflicts)
    conflict.local = live.get(conflict.key) ?? null;
  if (state.needsReview) return;
  for (const key of new Set([...Object.keys(state.seen), ...live.keys()])) {
    if (pending.has(key)) continue;
    const item = live.get(key) ?? null;
    if (sameItem(item, state.seen[key] ?? null)) continue;
    state.outbox.push({
      id: uuid(),
      key,
      base: state.baseline[key]?.version ?? 0,
      item,
    });
    state.seen[key] = item;
  }
}
export function acceptResponse(
  state: SyncState,
  response: SyncResponse,
  items: SyncItem[],
) {
  if (response.accountId !== state.accountId || response.cursor < state.cursor)
    throw new Error("Account or cursor changed");
  const live = new Map(items.map((x) => [itemKey(x), x]));
  if (response.reset) {
    state.needsReview = true;
    return items;
  }
  const pending = new Map(state.outbox.map((x) => [x.id, x])),
    dirty = new Set([
      ...state.outbox.map((x) => x.key),
      ...state.conflicts.map((x) => x.key),
    ]);
  for (const receipt of response.receipts) {
    const op = pending.get(receipt.id);
    if (!op) throw new Error("Unknown operation receipt");
    state.outbox = state.outbox.filter((x) => x.id !== receipt.id);
    if (receipt.status === "conflict") {
      state.conflicts = state.conflicts.filter((x) => x.key !== op.key);
      state.conflicts.push({
        key: op.key,
        local: live.get(op.key) ?? null,
        remote: receipt.record,
      });
    } else if (sameItem(live.get(op.key) ?? null, op.item))
      dirty.delete(op.key);
    // A local edit made during the request remains different from 'seen' and is queued next time.
  }
  const records = new Map(response.records.map((x) => [x.key, x]));
  for (const receipt of response.receipts) {
    const old = records.get(receipt.record.key);
    if (!old || old.version < receipt.record.version)
      records.set(receipt.record.key, receipt.record);
  }
  for (const row of records.values()) {
    if ((state.baseline[row.key]?.version ?? 0) > row.version) continue;
    state.baseline[row.key] = row;
    const conflict = state.conflicts.find((x) => x.key === row.key);
    if (conflict) conflict.remote = row;
    if (dirty.has(row.key)) continue;
    if (!sameItem(live.get(row.key) ?? null, state.seen[row.key] ?? null)) {
      if (!sameItem(live.get(row.key) ?? null, row.item))
        state.conflicts.push({
          key: row.key,
          local: live.get(row.key) ?? null,
          remote: row,
        });
      else state.seen[row.key] = row.item;
      continue;
    }
    if (row.item) live.set(row.key, row.item);
    else live.delete(row.key);
    state.seen[row.key] = row.item;
  }
  state.cursor = response.cursor;
  state.lastSyncAt = new Date().toISOString();
  return [...live.values()];
}
export function resolveConflict(
  state: SyncState,
  key: string,
  choice: "local" | "cloud",
  items: SyncItem[],
) {
  const conflict = state.conflicts.find((x) => x.key === key);
  if (!conflict) throw new Error("Conflict was already resolved");
  const live = new Map(items.map((x) => [itemKey(x), x]));
  state.baseline[key] = conflict.remote;
  state.seen[key] = conflict.remote.item;
  if (choice === "cloud") {
    if (conflict.remote.item) live.set(key, conflict.remote.item);
    else live.delete(key);
  }
  state.conflicts = state.conflicts.filter((x) => x.key !== key);
  return [...live.values()];
}

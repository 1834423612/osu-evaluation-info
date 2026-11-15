"use client";
import { importLocalItems } from "../saved/local.ts";
import { syncItemKey as itemKey, syncBatch, type SyncItem } from "./items.ts";
import { readSyncItems, replaceSyncItems } from "./workspace.ts";
import {
  savedScope,
  setSavedScope,
  scopedSavedKey,
  assertAuthenticatedAccount,
} from "../saved/scope.ts";
import { applySyncedItems } from "../saved/provenance.ts";
import { editCollections } from "../saved/collections.ts";
import { withSavedMutation } from "../saved/mutations.ts";
import { debugFlag } from "../debug/flags.ts";
import { SAVED_WORKSPACE_KEY, SAVED_STORAGE_KEYS } from "../saved/workspace.ts";
import { readSyncState, updateSyncState } from "./database.ts";
import {
  captureChanges,
  acceptResponse,
  resolveConflict,
  initializeMerge,
  mergeConflictCount,
} from "./model.ts";
import { sameItem, syncResponseSchema, type SyncResponse } from "./protocol.ts";
export const SYNC_EVENT = "course-atlas:sync-change";
function changed() {
  window.dispatchEvent(new Event(SYNC_EVENT));
}
export { readSyncState };
function validAccount(id: string) {
  assertAuthenticatedAccount(id);
  if (savedScope() !== id) throw new Error("account_changed");
}
async function exchange(accountId: string, body: Record<string, unknown>) {
  const r = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, accountId }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "unavailable");
  const response = syncResponseSchema.parse(data);
  if (response.accountId !== accountId) throw new Error("account_changed");
  return response;
}
async function lease(accountId: string) {
  const id = crypto.randomUUID();
  return updateSyncState(accountId, (state) => {
    if (state.lease && state.lease.until > Date.now()) return null;
    state.lease = { id, until: Date.now() + 30000 };
    return id;
  });
}
async function release(accountId: string, id: string) {
  await updateSyncState(accountId, (s) => {
    if (s.lease?.id === id) delete s.lease;
  });
  changed();
}
export async function syncCycle(accountId: string) {
  validAccount(accountId);
  const token = await lease(accountId);
  if (!token) return;
  try {
    const state = await updateSyncState(accountId, (s) => {
      validAccount(accountId);
      if (s.enabled && !s.needsReview)
        captureChanges(s, readSyncItems(), () => crypto.randomUUID());
      if (!navigator.onLine) s.problem = "offline";
      return structuredClone(s);
    });
    if (!state.enabled || state.needsReview || !navigator.onLine) return;
    const response = await exchange(accountId, {
      cursor: state.cursor,
      operations: syncBatch(state.outbox),
    });
    validAccount(accountId);
    await updateSyncState(accountId, (s) => {
      validAccount(accountId);
      if (s.lease?.id !== token) throw new Error("lease_expired");
      const live = readSyncItems(),
        next = acceptResponse(s, response, live);
      delete s.problem;
      if (!sameItem(next, live)) applySyncedItems(() => replaceSyncItems(next));
      if (!s.needsReview)
        captureChanges(s, readSyncItems(), () => crypto.randomUUID());
      if (s.once && !s.outbox.length && !s.conflicts.length && !s.needsReview)
        s.enabled = false;
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    await updateSyncState(accountId, (s) => {
      s.problem =
        code === "quota"
          ? "quota"
          : code === "unauthorized" || code === "account_changed"
            ? "unauthorized"
            : "unavailable";
    });
    throw error;
  } finally {
    await release(accountId, token);
  }
}
export type MergePreview = {
  response: SyncResponse;
  local: SyncItem[];
  incoming: number;
  outgoing: number;
  conflicts: number;
};
export async function previewMerge(accountId: string): Promise<MergePreview> {
  assertAuthenticatedAccount(accountId);
  if (debugFlag("factory")) throw new Error("simulation");
  const local = readSyncItems(),
    [response, state] = await Promise.all([
      exchange(accountId, { cursor: 0, operations: [] }),
      readSyncState(accountId),
    ]),
    live = new Map(local.map((x) => [itemKey(x), x]));
  assertAuthenticatedAccount(accountId);
  let incoming = 0;
  for (const r of response.records) {
    if (r.item && !live.has(r.key)) incoming++;
  }
  return {
    response,
    local,
    incoming,
    outgoing: local.filter(
      (x) => !response.records.some((r) => r.key === itemKey(x)),
    ).length,
    conflicts: mergeConflictCount(state, response, local),
  };
}
export async function enableSync(
  accountId: string,
  preview: MergePreview,
  once = false,
) {
  assertAuthenticatedAccount(accountId);
  if (debugFlag("factory")) throw new Error("simulation");
  if (preview.response.accountId !== accountId)
    throw new Error("account_changed");
  const token = await lease(accountId);
  if (!token) throw new Error("busy");
  try {
    const previous = await readSyncState(accountId);
    assertAuthenticatedAccount(accountId);
    if (previous.initialized && !previous.needsReview) {
      await updateSyncState(accountId, (s) => {
        s.enabled = true;
        s.once = once;
      });
      return;
    }
    await withSavedMutation(() => {
      assertAuthenticatedAccount(accountId);
      const sourceItems = readSyncItems();
      // Guest snapshots remain untouched. Each account has its own physical workspace.
      if (
        !localStorage.getItem(scopedSavedKey(SAVED_WORKSPACE_KEY, accountId))
      ) {
        const guest =
          localStorage.getItem(SAVED_WORKSPACE_KEY) ??
          JSON.stringify({
            version: 1,
            records: Object.fromEntries(
              SAVED_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]),
            ),
          });
        if (guest)
          localStorage.setItem(
            scopedSavedKey(SAVED_WORKSPACE_KEY, accountId),
            guest,
          );
      }
      setSavedScope(accountId);
      // Legacy guest keys may not yet have an atomic workspace; import the captured items too.
      applySyncedItems(() => {
        importLocalItems(
          sourceItems.filter((x) => x.kind !== "collection"),
          "sync",
        );
        editCollections((current) => {
          const merged = new Map(current.map((x) => [x.id, x]));
          for (const item of sourceItems)
            if (item.kind === "collection" && !merged.has(item.payload.id))
              merged.set(item.payload.id, item.payload);
          return [...merged.values()];
        });
      });
    });
    await updateSyncState(accountId, (s) => {
      validAccount(accountId);
      const merged = initializeMerge(s, preview.response, readSyncItems(), () =>
        crypto.randomUUID(),
      );
      applySyncedItems(() => replaceSyncItems(merged));
      s.once = once;
    });
  } finally {
    await release(accountId, token);
  }
}
export async function pauseSync(accountId: string) {
  await updateSyncState(accountId, (s) => {
    s.enabled = false;
  });
  changed();
}
export async function chooseConflict(
  accountId: string,
  key: string,
  choice: "local" | "cloud" | "both",
) {
  validAccount(accountId);
  const token = await lease(accountId);
  if (!token) throw new Error("busy");
  try {
    await updateSyncState(accountId, (s) => {
      validAccount(accountId);
      applySyncedItems(() =>
        replaceSyncItems(resolveConflict(s, key, choice, readSyncItems())),
      );
      captureChanges(s, readSyncItems(), () => crypto.randomUUID());
    });
  } finally {
    await release(accountId, token);
  }
}

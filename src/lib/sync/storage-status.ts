import type { SyncState } from "./model.ts";
import { syncItemKey, type SyncItem } from "./items.ts";
import { sameItem } from "./protocol.ts";
export function cloudHasItem(state: SyncState | null, item: SyncItem) {
  const key = syncItemKey(item);
  return (
    !!state?.baseline[key]?.item &&
    sameItem(item, state.baseline[key].item) &&
    !state.outbox.some((op) => op.key === key) &&
    !state.conflicts.some((conflict) => conflict.key === key)
  );
}
export function hasPendingSavedChanges(state: SyncState, items: SyncItem[]) {
  const live = new Map(items.map((item) => [syncItemKey(item), item]));
  return (
    state.outbox.length > 0 ||
    state.conflicts.length > 0 ||
    state.needsReview ||
    items.some(
      (item) =>
        !sameItem(item, state.baseline[syncItemKey(item)]?.item ?? null),
    ) ||
    Object.values(state.baseline).some(
      (record) => record.item && !live.has(record.key),
    )
  );
}

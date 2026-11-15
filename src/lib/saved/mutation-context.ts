let depth = 0;
/** Enter only from the synchronous callback of the shared IndexedDB write transaction. */
export function withinSavedTransaction<T>(action: () => T): T {
  depth++;
  try {
    return action();
  } finally {
    depth--;
  }
}
export function assertSavedTransaction() {
  if (!depth) throw new Error("saved_transaction_required");
}

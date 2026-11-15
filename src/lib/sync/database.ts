import { newSyncState, type SyncState } from "./model.ts";
import { userDatabase as database } from "../user-data/browser-db.ts";
import { withinSavedTransaction } from "../saved/mutation-context.ts";
export async function readSyncState(accountId: string): Promise<SyncState> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const req = db.transaction("sync").objectStore("sync").get(accountId);
    req.onsuccess = () => resolve(req.result ?? newSyncState(accountId));
    req.onerror = () => reject(req.error);
  });
}
export async function updateSyncState<T>(
  accountId: string,
  edit: (state: SyncState) => T,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync", "readwrite"),
      store = tx.objectStore("sync"),
      req = store.get(accountId);
    let result: T;
    req.onsuccess = () => {
      try {
        const state: SyncState = req.result ?? newSyncState(accountId);
        result = withinSavedTransaction(() => edit(state));
        if (result && typeof (result as { then?: unknown }).then === "function")
          throw new Error("sync_edit_must_be_synchronous");
        store.put(state);
      } catch (e) {
        tx.abort();
        reject(e);
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Local sync transaction cancelled"));
    tx.onerror = () => reject(tx.error);
  });
}

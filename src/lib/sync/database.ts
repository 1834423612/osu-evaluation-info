import { newSyncState, type SyncState } from "./model.ts";
let opening: Promise<IDBDatabase> | undefined;
function database() {
  return (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("waho-user-data", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("sync", { keyPath: "accountId" });
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        opening = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      opening = undefined;
      reject(request.error);
    };
  }));
}
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
        result = edit(state);
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

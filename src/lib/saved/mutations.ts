import { readLocalItems } from "./local.ts";
import { itemKey, itemTitle } from "./exchange.ts";
import { userDatabase } from "../user-data/browser-db.ts";
import { savedScope } from "./scope.ts";
import { withinSavedTransaction } from "./mutation-context.ts";
import { notifySaveFailure } from "./capacity.ts";
/** The sync store is the common mutex for sync reconciliation and local edits.
 * Read and commit inside this synchronous callback; never await network or UI work here. */
export async function withSavedMutation<T>(action: () => T): Promise<T> {
  const scope = savedScope(),
    db = await userDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sync", "readwrite"),
      req = tx.objectStore("sync").get("__saved_workspace_mutex__");
    let result: T;
    req.onsuccess = () => {
      try {
        if (savedScope() !== scope) throw new Error("account_changed");
        result = withinSavedTransaction(action);
        if (result && typeof (result as { then?: unknown }).then === "function")
          throw new Error("saved_mutation_must_be_synchronous");
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(tx.error ?? new Error("saved_mutation_cancelled"));
    tx.onerror = () => reject(tx.error);
  });
}
export function runSavedAction(action: () => boolean) {
  const scope = savedScope();
  return withSavedMutation(() => {
    let before = new Set<string>();
    try {
      before = new Set(readLocalItems().map(itemKey));
    } catch {}
    const result = action();
    let added: ReturnType<typeof readLocalItems> = [];
    if (result) {
      try {
        added = readLocalItems().filter((item) => !before.has(itemKey(item)));
      } catch {}
    }
    return { result, added };
  })
    .then(({ result, added }) => {
      if (result && added.length === 1 && savedScope() === scope)
        window.dispatchEvent(
          new CustomEvent("course-atlas:favorite-added", {
            detail: {
              key: itemKey(added[0]),
              title: itemTitle(added[0]),
              scope,
            },
          }),
        );
      return result;
    })
    .catch((error) => {
      notifySaveFailure(error);
      return false;
    });
}

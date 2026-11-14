let opening: Promise<IDBDatabase> | undefined;
/** All personal-data clients share the schema version and upgrade handler. */
export function userDatabase() {
  return (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("waho-user-data", 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of [
        ["sync", "accountId"],
        ["telemetry", "id"],
      ])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name, { keyPath });
    };
    request.onblocked = () => {
      blocked = true;
      opening = undefined;
      reject(new Error("Close older tabs to update browser storage"));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
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

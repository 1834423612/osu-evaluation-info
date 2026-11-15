import { readLocalItems, replaceLocalItems } from "../saved/local.ts";
import { readCollections } from "../saved/collections.ts";
import { favoriteItems, type SyncItem } from "./items.ts";
export function readSyncItems(): SyncItem[] {
  return [
    ...readLocalItems(),
    ...readCollections().map((payload) => ({
      kind: "collection" as const,
      payload,
    })),
  ];
}
export function replaceSyncItems(items: SyncItem[]) {
  replaceLocalItems(
    favoriteItems(items),
    items.flatMap((x) => (x.kind === "collection" ? [x.payload] : [])),
  );
}

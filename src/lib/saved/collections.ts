"use client";
import { browserStorage } from "../preferences/browser-storage.ts";
import { PREFERENCES_EVENT } from "../preferences/locale.ts";
import { readSavedWorkspace, SAVED_WORKSPACE_KEY } from "./workspace.ts";
import {
  collectionSchema,
  collectionsSchema,
  type SavedCollection,
} from "./collection-schema.ts";
export function readCollections(): SavedCollection[] {
  return readSavedWorkspace(browserStorage()).collections ?? [];
}
/** Call inside withSavedMutation; all organization and favorite writes share its lock. */
export function editCollections(
  edit: (current: SavedCollection[]) => SavedCollection[],
) {
  const store = browserStorage(),
    current = readSavedWorkspace(store);
  const next = collectionsSchema.parse(edit(current.collections ?? []));
  store.setItem(
    SAVED_WORKSPACE_KEY,
    JSON.stringify({ ...current, version: 2, collections: next }),
  );
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}
export function saveCollection(value: SavedCollection) {
  const next = collectionSchema.parse(value);
  editCollections((current) =>
    current.some((x) => x.id === next.id)
      ? current.map((x) => (x.id === next.id ? next : x))
      : [...current, next],
  );
}
export function assignCollection(
  keys: Set<string>,
  target: string,
  source?: string,
) {
  editCollections((current) => {
    if (!current.some((x) => x.id === target))
      throw new Error("collection_removed");
    return current.map((x) =>
      x.id === target
        ? { ...x, members: [...new Set([...x.members, ...keys])] }
        : x.id === source
          ? { ...x, members: x.members.filter((key) => !keys.has(key)) }
          : x,
    );
  });
}

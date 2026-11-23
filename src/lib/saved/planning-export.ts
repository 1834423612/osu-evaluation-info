"use client";
import { readLocalItems, replaceLocalItems } from "./local.ts";
import { readCollections } from "./collections.ts";
import { collectionsSchema } from "./collection-schema.ts";
import { itemKey, type ExchangeItem } from "./exchange.ts";
export function exportPlanningFavorites(
  incoming: ExchangeItem[],
  target: { id: string; name?: string },
) {
  const existing = readLocalItems(),
    folders = readCollections(),
    keys = incoming.map(itemKey);
  const nextFolders =
    target.name !== undefined
      ? [
          ...folders,
          { id: target.id, name: target.name.trim(), tags: [], members: keys },
        ]
      : folders.map((f) =>
          f.id === target.id
            ? { ...f, members: [...new Set([...f.members, ...keys])] }
            : f,
        );
  if (target.name === undefined && !folders.some((f) => f.id === target.id))
    throw Error("collection_removed");
  const validated = collectionsSchema.parse(nextFolders);
  const merged = new Map(existing.map((item) => [itemKey(item), item]));
  for (const item of incoming)
    if (!merged.has(itemKey(item))) merged.set(itemKey(item), item);
  // Validate both domains before a single localStorage workspace commit.
  replaceLocalItems([...merged.values()], validated);
}

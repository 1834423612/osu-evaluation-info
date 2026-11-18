import { itemKey, type ExchangeItem } from "./exchange.ts";
import type { SavedCollection } from "./collection-schema.ts";

export const UNFILED_SHARE_GROUP = "unfiled";
export type ShareGroup = {
  id: string;
  collection?: SavedCollection;
  items: ExchangeItem[];
};
export type ShareSelection = Record<string, string[]>;

export function shareSelectionFingerprint(selection: ShareSelection) {
  return JSON.stringify(
    Object.entries(selection)
      .filter(([, keys]) => keys.length)
      .map(([id, keys]) => [id, [...keys].sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function shareGroups(
  items: ExchangeItem[],
  collections: SavedCollection[],
) {
  const filed = new Set<string>();
  const groups: ShareGroup[] = collections.flatMap((collection) => {
    const members = new Set(collection.members);
    const found = items.filter((item) => members.has(itemKey(item)));
    found.forEach((item) => filed.add(itemKey(item)));
    return found.length
      ? [{ id: collection.id, collection, items: found }]
      : [];
  });
  const unfiled = items.filter((item) => !filed.has(itemKey(item)));
  if (unfiled.length) groups.push({ id: UNFILED_SHARE_GROUP, items: unfiled });
  return groups;
}

export function initialShareSelection(
  groups: ShareGroup[],
  selected: ReadonlySet<string>,
  activeId?: string,
): ShareSelection {
  const active = groups.find((group) => group.id === activeId);
  if (!selected.size)
    return active ? { [active.id]: active.items.map(itemKey) } : {};
  const remaining = new Set(selected);
  const result: ShareSelection = {};
  // Each initial item belongs to one explicitly chosen group. Overlapping,
  // unselected folder metadata must never be inferred from item membership.
  for (const group of active
    ? [active, ...groups.filter((group) => group !== active)]
    : groups) {
    const keys = group.items.map(itemKey).filter((key) => remaining.has(key));
    if (keys.length) result[group.id] = keys;
    keys.forEach((key) => remaining.delete(key));
  }
  return result;
}

export function projectShareSelection(
  groups: ShareGroup[],
  selection: ShareSelection,
) {
  const keys = new Set<string>();
  const collections: SavedCollection[] = [];
  let memberships = 0;
  for (const group of groups) {
    const allowed = new Set(selection[group.id] ?? []);
    const members = group.items.map(itemKey).filter((key) => allowed.has(key));
    members.forEach((key) => keys.add(key));
    memberships += members.length;
    if (group.collection && members.length)
      collections.push({ ...group.collection, members });
  }
  return { keys, collections, duplicates: memberships - keys.size };
}

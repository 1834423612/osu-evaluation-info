"use client";
import { browserStorage } from "../preferences/browser-storage.ts";
import { PREFERENCES_EVENT } from "../preferences/locale.ts";
import {
  SAVED_STORAGE_KEYS,
  SAVED_WORKSPACE_KEY,
  readSavedWorkspace,
  mergeSavedDelta,
  type SavedWorkspace,
} from "./workspace.ts";
import {
  exchangeItemSchema,
  itemKey,
  type ExchangeItem,
  type SavedKind,
  type SavedSnapshot,
} from "./exchange.ts";
const kinds: SavedKind[] = ["course", "section", "instructor", "syllabus"],
  limits = [100, 200, 200, 200];
export type LocalRemoval = { previous: SavedWorkspace; keys: string[] };
function workspaceItems(workspace: SavedWorkspace): ExchangeItem[] {
  const items: ExchangeItem[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const raw = workspace.records[SAVED_STORAGE_KEYS[i]],
      value = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) throw new Error("Saved data is unavailable");
    for (const original of value) {
      const payload =
        kinds[i] === "course"
          ? {
              ...original,
              description: "",
              sections: [],
              sectionsPartial: true,
            }
          : original;
      const parsed = exchangeItemSchema.safeParse({ kind: kinds[i], payload });
      if (!parsed.success)
        throw new Error(
          "A saved item needs repair before importing or syncing",
        );
      items.push(parsed.data);
    }
  }
  return items;
}
export function readLocalItems() {
  return workspaceItems(readSavedWorkspace(browserStorage()));
}
export function createLocalSnapshot(title: string): SavedSnapshot {
  return {
    version: 1,
    title,
    createdAt: new Date().toISOString(),
    items: readLocalItems(),
  };
}
function commit(
  previous: SavedWorkspace,
  next: ExchangeItem[],
  originals = new Map<string, unknown>(),
) {
  const before = workspaceItems(previous),
    records: Record<string, string> = {};
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i],
      prior = before.filter((x) => x.kind === kind),
      incoming = next.filter((x) => x.kind === kind);
    if (incoming.length > limits[i])
      throw new Error(
        "Saved-item limit reached. Select fewer items or export a backup.",
      );
    const oldIds = new Set(prior.map(itemKey));
    const merged = mergeSavedDelta(
      JSON.stringify(prior.map((x) => x.payload)),
      JSON.stringify(incoming.map((x) => x.payload)),
      previous.records[SAVED_STORAGE_KEYS[i]],
    ).map((payload) => {
      const key = kind + ":" + payload.id;
      return !oldIds.has(key) && originals.has(key)
        ? originals.get(key)
        : payload;
    });
    records[SAVED_STORAGE_KEYS[i]] = JSON.stringify(merged);
  }
  browserStorage().setItem(
    SAVED_WORKSPACE_KEY,
    JSON.stringify({ version: 1, records }),
  );
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}
export function importLocalItems(
  incoming: ExchangeItem[],
  mode: "copy" | "sync" = "copy",
) {
  const previous = readSavedWorkspace(browserStorage()),
    current = workspaceItems(previous),
    unique = new Map(current.map((item) => [itemKey(item), item]));
  let added = 0,
    skipped = 0;
  for (const raw of incoming) {
    const item = exchangeItemSchema.parse(raw),
      key = itemKey(item);
    if (unique.has(key)) {
      skipped++;
      continue;
    }
    if (mode === "copy" && item.kind === "syllabus") {
      item.payload.acknowledged = null;
      item.payload.latest = null;
      item.payload.checkedAt = null;
    }
    unique.set(key, item);
    added++;
  }
  commit(previous, [...unique.values()]);
  return { added, skipped, previous };
}
export function replaceLocalItems(items: ExchangeItem[]) {
  const previous = readSavedWorkspace(browserStorage());
  commit(
    previous,
    items.map((x) => exchangeItemSchema.parse(x)),
  );
}
export function removeLocalItems(keys: Set<string>): LocalRemoval {
  const previous = readSavedWorkspace(browserStorage()),
    current = workspaceItems(previous);
  commit(
    previous,
    current.filter((x) => !keys.has(itemKey(x))),
  );
  return { previous, keys: [...keys] };
}
export function restoreLocalRemoval(undo: LocalRemoval) {
  const previous = readSavedWorkspace(browserStorage()),
    current = workspaceItems(previous),
    unique = new Map(current.map((x) => [itemKey(x), x])),
    keys = new Set(undo.keys),
    originals = new Map<string, unknown>();
  for (let i = 0; i < kinds.length; i++)
    for (const raw of JSON.parse(
      undo.previous.records[SAVED_STORAGE_KEYS[i]] ?? "[]",
    ))
      originals.set(kinds[i] + ":" + raw.id, raw);
  for (const item of workspaceItems(undo.previous))
    if (keys.has(itemKey(item)) && !unique.has(itemKey(item)))
      unique.set(itemKey(item), item);
  commit(previous, [...unique.values()], originals);
}

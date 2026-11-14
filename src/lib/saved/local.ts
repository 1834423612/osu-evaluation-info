"use client";
import { browserStorage } from "../preferences/browser-storage";
import { PREFERENCES_EVENT } from "../preferences/locale";
import {
  SAVED_STORAGE_KEYS,
  SAVED_WORKSPACE_KEY,
  readSavedWorkspace,
} from "./workspace";
import {
  exchangeItemSchema,
  itemKey,
  type ExchangeItem,
  type SavedKind,
  type SavedSnapshot,
} from "./exchange";
const kinds: SavedKind[] = ["course", "section", "instructor", "syllabus"];
export function readLocalItems(): ExchangeItem[] {
  const store = browserStorage(),
    items: ExchangeItem[] = [];
  for (let i = 0; i < kinds.length; i++) {
    const raw = store.getItem(SAVED_STORAGE_KEYS[i]),
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
export function createLocalSnapshot(title: string): SavedSnapshot {
  const items = readLocalItems().map((item) =>
    item.kind === "course"
      ? {
          ...item,
          payload: {
            ...item.payload,
            description: "",
            sections: [],
            sectionsPartial: true,
          },
        }
      : item,
  );
  return { version: 1, title, createdAt: new Date().toISOString(), items };
}
export function importLocalItems(
  incoming: ExchangeItem[],
  mode: "copy" | "sync" = "copy",
) {
  const store = browserStorage(),
    current = readLocalItems(),
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
  const items = [...unique.values()],
    limits = [100, 200, 200, 200];
  for (let i = 0; i < kinds.length; i++)
    if (items.filter((x) => x.kind === kinds[i]).length > limits[i])
      throw new Error(
        "Saved-item limit reached. Select fewer items or export a backup.",
      );
  const previous = readSavedWorkspace(store);
  const records = Object.fromEntries(
    kinds.map((kind, i) => [
      SAVED_STORAGE_KEYS[i],
      JSON.stringify(
        items.filter((x) => x.kind === kind).map((x) => x.payload),
      ),
    ]),
  );
  store.setItem(SAVED_WORKSPACE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
  return { added, skipped, previous };
}
export function replaceLocalItems(items: ExchangeItem[]) {
  const store = browserStorage();
  for (const item of items) exchangeItemSchema.parse(item);
  const records = Object.fromEntries(
    kinds.map((kind, i) => [
      SAVED_STORAGE_KEYS[i],
      JSON.stringify(
        items.filter((x) => x.kind === kind).map((x) => x.payload),
      ),
    ]),
  );
  store.setItem(SAVED_WORKSPACE_KEY, JSON.stringify({ version: 1, records }));
  window.dispatchEvent(new Event(PREFERENCES_EVENT));
}

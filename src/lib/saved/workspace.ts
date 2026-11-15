import { checkSavedCapacity } from "./capacity.ts";
import {
  collectionsSchema,
  type SavedCollection,
} from "./collection-schema.ts";
export const SAVED_WORKSPACE_KEY = "course-atlas:saved-workspace:v1";
export const SAVED_STORAGE_KEYS = [
  "course-atlas:saved:v1",
  "course-atlas:saved-sections:v1",
  "course-atlas:saved-instructors:v1",
  "course-atlas:saved-syllabi:v1",
] as const;
export type SavedStorageKey = (typeof SAVED_STORAGE_KEYS)[number];
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SavedWorkspace = {
  version: 1 | 2;
  records: Record<string, string | null>;
  collections?: SavedCollection[];
};
let decodedRaw: string | undefined;
let decodedWorkspace: SavedWorkspace | undefined;
export function isSavedStorageKey(key: string): key is SavedStorageKey {
  return (SAVED_STORAGE_KEYS as readonly string[]).includes(key);
}
export function readSavedWorkspace(store: Store): SavedWorkspace {
  const raw = store.getItem(SAVED_WORKSPACE_KEY);
  if (!raw)
    return {
      version: 1,
      records: Object.fromEntries(
        SAVED_STORAGE_KEYS.map((key) => [key, store.getItem(key)]),
      ),
    };
  if (raw === decodedRaw && decodedWorkspace)
    return structuredClone(decodedWorkspace);
  const parsed = JSON.parse(raw);
  if (
    ![1, 2].includes(parsed?.version) ||
    !parsed.records ||
    SAVED_STORAGE_KEYS.some(
      (key) =>
        parsed.records[key] !== null && typeof parsed.records[key] !== "string",
    )
  )
    throw new Error("Saved workspace is unavailable");
  decodedWorkspace = {
    version: parsed.version,
    records: Object.fromEntries(
      SAVED_STORAGE_KEYS.map((key) => [key, parsed.records[key]]),
    ),
    ...(parsed.version === 2
      ? { collections: collectionsSchema.parse(parsed.collections) }
      : {}),
  };
  decodedRaw = raw;
  return structuredClone(decodedWorkspace);
}
function array(raw: string | null): Record<string, unknown>[] {
  const value = raw ? JSON.parse(raw) : [];
  if (
    !Array.isArray(value) ||
    value.some((x) => !x || typeof x !== "object" || typeof x.id !== "string")
  )
    throw new Error("Saved data is invalid");
  return value;
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function mergeRecord(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const result = { ...current };
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (["__proto__", "constructor", "prototype"].includes(key)) continue;
    if (same(base[key], next[key])) continue;
    const before = base[key],
      after = next[key],
      live = current[key];
    if (
      key === "courses" &&
      Array.isArray(before) &&
      Array.isArray(after) &&
      Array.isArray(live)
    ) {
      result[key] = mergeSavedDelta(
        JSON.stringify(before),
        JSON.stringify(after),
        JSON.stringify(live),
      );
    } else if (
      before &&
      after &&
      live &&
      typeof before === "object" &&
      typeof after === "object" &&
      typeof live === "object" &&
      !Array.isArray(before) &&
      !Array.isArray(after) &&
      !Array.isArray(live)
    ) {
      result[key] = mergeRecord(
        before as Record<string, unknown>,
        after as Record<string, unknown>,
        live as Record<string, unknown>,
      );
    } else if (after === undefined) delete result[key];
    else result[key] = after;
  }
  return result;
}
/** Apply the caller's change, preserving unrelated changes from another tab. */
export function mergeSavedDelta(
  baseRaw: string | null,
  nextRaw: string | null,
  liveRaw: string | null,
) {
  const before = array(baseRaw),
    after = array(nextRaw),
    live = array(liveRaw);
  const base = new Map(before.map((x) => [x.id, x])),
    next = new Map(after.map((x) => [x.id, x])),
    merged = new Map(live.map((x) => [x.id, x]));
  for (const id of base.keys()) if (!next.has(id)) merged.delete(id);
  for (const [id, value] of next) {
    if (same(base.get(id), value)) continue;
    const current = merged.get(id),
      old = base.get(id);
    // An unrelated edit cannot resurrect an item deleted by another tab.
    if (old && !current) continue;
    merged.set(id, old && current ? mergeRecord(old, value, current) : value);
  }
  return [...merged.values()];
}
export function writeSavedArray(
  store: Store,
  key: SavedStorageKey,
  raw: string,
  base: string | null,
) {
  const current = readSavedWorkspace(store);
  const next = mergeSavedDelta(base, raw, current.records[key]);
  checkSavedCapacity(key, next, array(current.records[key]));
  current.records[key] = JSON.stringify(next);
  store.setItem(SAVED_WORKSPACE_KEY, JSON.stringify(current));
}
export function replaceSavedWorkspace(
  store: Store,
  records: Record<SavedStorageKey, string | null>,
) {
  const current = readSavedWorkspace(store);
  for (const key of SAVED_STORAGE_KEYS)
    checkSavedCapacity(key, array(records[key]), array(current.records[key]));
  store.setItem(SAVED_WORKSPACE_KEY, JSON.stringify({ ...current, records }));
}

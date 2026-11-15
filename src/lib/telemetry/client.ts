"use client";
import { browserContext } from "./context.ts";
import { userDatabase } from "../user-data/browser-db.ts";
import { browserUuid } from "../uuid.ts";
import { debugFlag } from "../debug/flags.ts";
import {
  ANALYTICS_KEY,
  parseAnalyticsPreference,
} from "../analytics/privacy.ts";
import { productEventSchema, type ProductEvent } from "./protocol.ts";
let timer: ReturnType<typeof setTimeout> | undefined,
  running = false,
  retries = 0;
let identifiedVisitor: string | null = null;
let pendingVisitor: string | null = null;
export function bindUmamiVisitor(value?: string) {
  if (value && /^[a-f0-9]{64}$/.test(value)) pendingVisitor = value;
  if (
    !telemetryAllowed() ||
    !pendingVisitor ||
    identifiedVisitor === pendingVisitor ||
    !window.umami?.identify
  )
    return;
  try {
    window.umami.identify(pendingVisitor);
    identifiedVisitor = pendingVisitor;
  } catch {}
}
let openCourse: string | null = null;
let currentPage: string | null = null;
const memory = new Map<string, Stored>();
const volatileIds: Partial<Record<"device" | "session", string>> = {};
export function recordPageView(path: string) {
  if (currentPage === path) return false;
  currentPage = path;
  recordProductEvents([{ type: "page_view", path }]);
  return true;
}
export function telemetryAllowed() {
  if (
    typeof window === "undefined" ||
    debugFlag("skipAnalytics") ||
    debugFlag("factory") ||
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return false;
  try {
    return parseAnalyticsPreference(localStorage.getItem(ANALYTICS_KEY))
      .enabled;
  } catch {
    return true;
  }
}
export function resetCourseOpen() {
  openCourse = null;
}
export function recordCourseOpen(id: string) {
  if (openCourse === id) return;
  openCourse = id;
  recordProductEvents([{ type: "course_open", entity: "course:" + id }]);
}
type Input = Omit<ProductEvent, "id" | "path" | "capturedAt" | "term"> & {
  path?: string;
  term?: string;
};
type Stored = ProductEvent & { queuedAt: number };
export function recordProductEvents(events: Input[]) {
  if (!telemetryAllowed()) return;
  let parsed: Stored[];
  try {
    parsed = events
      .map((event) =>
        productEventSchema.safeParse({
          ...event,
          id: browserUuid(),
          path: event.path ?? location.pathname,
          capturedAt: new Date().toISOString(),
        }),
      )
      .filter((x) => x.success)
      .map((x) => ({ ...x.data!, queuedAt: Date.now() }));
  } catch {
    return;
  } // Optional telemetry cannot prevent navigation or saving.
  if (!parsed.length) return;
  for (const event of parsed) memory.set(event.id, event);
  while (memory.size > 20) memory.delete(memory.keys().next().value!);
  void userDatabase()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction("telemetry", "readwrite"),
            store = tx.objectStore("telemetry");
          for (const event of parsed) store.put(event);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        }),
    )
    .then(() => scheduleTelemetry())
    .catch(() => {});
}
export function scheduleTelemetry() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(
    () => void flushTelemetry(),
    Math.min(60000, 2000 * 2 ** Math.min(retries, 5) + Math.random() * 1000),
  );
}
async function pending() {
  const db = await userDatabase();
  return new Promise<Stored[]>((resolve, reject) => {
    const tx = db.transaction("telemetry", "readwrite"),
      store = tx.objectStore("telemetry"),
      r = store.openCursor(),
      items: Stored[] = [];
    let valid = 0;
    r.onsuccess = () => {
      const cursor = r.result;
      if (!cursor) return;
      const value = cursor.value as Stored;
      if (value.queuedAt < Date.now() - 86400000 || valid++ >= 500)
        cursor.delete();
      else if (items.length < 20) items.push(value);
      cursor.continue();
    };
    tx.oncomplete = () => resolve(items);
    tx.onerror = () => reject(tx.error);
  });
}
function identity(kind: "device" | "session") {
  try {
    const store = kind === "device" ? localStorage : sessionStorage,
      key = "course-atlas:telemetry-" + kind + ":v1";
    let id = store.getItem(key);
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
      id = browserUuid();
      store.setItem(key, id);
    }
    return id;
  } catch {
    return (volatileIds[kind] ??= browserUuid());
  }
}
function body(events: Stored[]) {
  return {
    device: identity("device"),
    session: identity("session"),
    language: navigator.language.slice(0, 50),
    languages: [...navigator.languages].slice(0, 10).map((x) => x.slice(0, 50)),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport:
      innerWidth < 640 ? "small" : innerWidth < 1100 ? "medium" : "large",
    context: browserContext(),
    events: events.map((event) => productEventSchema.parse(event)),
  };
}
export function telemetryBeacon() {
  if (!telemetryAllowed() || !memory.size || !navigator.sendBeacon)
    return false;
  try {
    return navigator.sendBeacon(
      "/api/telemetry",
      new Blob([JSON.stringify(body([...memory.values()]))], {
        type: "application/json",
      }),
    );
  } catch {
    return false;
  }
}
export async function flushTelemetry(beacon = false) {
  if (running || !telemetryAllowed()) return;
  running = true;
  try {
    const events = await pending();
    if (!events.length) return;
    const payload = JSON.stringify(await body(events));
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/telemetry",
        new Blob([payload], { type: "application/json" }),
      );
      return;
    }
    if (!navigator.onLine) return;
    const r = await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(8000),
      keepalive: true,
    });
    if (!r.ok) throw Error();
    const data = await r.json();
    if (typeof data.visitorId === "string") bindUmamiVisitor(data.visitorId);
    const sent = new Set(events.map((x) => x.id));
    if (
      !Array.isArray(data.receipts) ||
      !data.receipts.every(
        (id: unknown) => typeof id === "string" && sent.has(id),
      )
    )
      throw Error();
    const db = await userDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("telemetry", "readwrite"),
        store = tx.objectStore("telemetry");
      for (const id of data.receipts) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    for (const id of data.receipts) memory.delete(id);
    retries = 0;
    if (events.length === 20) scheduleTelemetry();
  } catch {
    retries++;
    scheduleTelemetry();
  } finally {
    running = false;
  }
}
export async function discardTelemetry() {
  if (timer) clearTimeout(timer);
  memory.clear();
  const db = await userDatabase();
  db.transaction("telemetry", "readwrite").objectStore("telemetry").clear();
}

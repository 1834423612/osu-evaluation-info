export const WATCH_SELECTION_KEY = "course-atlas:watch-sections:v1";
export const LARGE_WATCH_SELECTION = 8;
export const WATCH_SELECTION_EVENT = "course-atlas:watch-selection";
const EMPTY: string[] = [];
let raw: string | null = null;
let memory: Record<string, string[]> = {};

export function getWatchSelection(courseId: string) {
  try {
    const next = localStorage.getItem(WATCH_SELECTION_KEY);
    if (next !== raw) {
      raw = next;
      const parsed: unknown = next ? JSON.parse(next) : {};
      memory = {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed).slice(-100)) {
          if (Array.isArray(value))
            memory[key] = [
              ...new Set(
                value.filter(
                  (id): id is string =>
                    typeof id === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(id),
                ),
              ),
            ].slice(0, 500);
        }
      }
    }
  } catch {
    /* Memory selection remains usable if storage is blocked. */
  }
  return memory[courseId] ?? EMPTY;
}

export function saveWatchSelection(courseId: string, selected: string[]) {
  getWatchSelection(courseId);
  memory = { ...memory, [courseId]: [...new Set(selected)].slice(0, 500) };
  const keys = Object.keys(memory);
  for (const key of keys.slice(0, -100)) delete memory[key];
  try {
    const serialized = JSON.stringify(memory);
    localStorage.setItem(WATCH_SELECTION_KEY, serialized);
    raw = serialized;
  } catch {
    /* Keep the in-memory choice. */
  }
  window.dispatchEvent(new Event(WATCH_SELECTION_EVENT));
}

export function watchIntervalMs(seconds: number, selectedCount: number) {
  return Math.max(10_000, seconds * 1000, selectedCount * 1000);
}

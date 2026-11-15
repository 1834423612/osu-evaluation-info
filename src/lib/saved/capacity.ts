import type { SavedStorageKey } from "./workspace.ts";
export class SavedCapacityError extends Error {
  limit: number;
  constructor(limit: number) {
    super("saved_capacity");
    this.name = "SavedCapacityError";
    this.limit = limit;
  }
}
export function checkSavedCapacity(
  key: SavedStorageKey,
  next: Record<string, unknown>[],
  before: Record<string, unknown>[],
) {
  const limit = key === "course-atlas:saved:v1" ? 100 : 200;
  if (next.length > limit && next.length > before.length)
    throw new SavedCapacityError(limit);
  if (key === "course-atlas:saved-instructors:v1") {
    const previous = new Map(before.map((item) => [item.id, item]));
    for (const item of next) {
      const courses = item.courses,
        old = previous.get(item.id)?.courses;
      if (
        Array.isArray(courses) &&
        courses.length > 30 &&
        courses.length > (Array.isArray(old) ? old.length : 0)
      )
        throw new SavedCapacityError(30);
    }
  }
}
export function notifySaveFailure(error: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("course-atlas:save-error", {
      detail: {
        error:
          error instanceof SavedCapacityError
            ? "capacity"
            : error instanceof DOMException &&
                error.name === "QuotaExceededError"
              ? "storage"
              : "failed",
        limit: error instanceof SavedCapacityError ? error.limit : undefined,
      },
    }),
  );
}

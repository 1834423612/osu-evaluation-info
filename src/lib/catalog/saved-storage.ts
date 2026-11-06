import {
  withoutCourseAvailability,
  withoutSectionAvailability,
} from "./availability.ts";
import type { CatalogCourse, CatalogSection } from "./types";

/** Idempotently scrub old local snapshots without losing saved identities. */
export function migrateSavedAvailability(
  storage: Pick<Storage, "getItem" | "setItem">,
) {
  for (const [key, kind] of [
    ["course-atlas:saved:v1", "courses"],
    ["course-atlas:saved-sections:v1", "sections"],
  ] as const) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values)) continue;
      const clean = values.map((item) => {
        if (!item || typeof item !== "object") return item;
        if (kind === "courses" && Array.isArray(item.sections))
          return withoutCourseAvailability(item as CatalogCourse);
        if (
          kind === "sections" &&
          item.section &&
          typeof item.section === "object"
        )
          return {
            ...item,
            section: withoutSectionAvailability(item.section as CatalogSection),
          };
        return item;
      });
      const updated = JSON.stringify(clean);
      if (updated !== raw) storage.setItem(key, updated);
    } catch {
      /* Storage can be unavailable; callers still sanitize on read. */
    }
  }
}

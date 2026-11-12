"use client";

import { useSyncExternalStore } from "react";
import { browserStorage } from "@/lib/preferences/browser-storage";
import { PREFERENCES_EVENT } from "@/lib/preferences/locale";
import {
  SAVED_SYLLABI_KEY,
  parseSavedSyllabi,
  createSavedSyllabus,
  observeSyllabus,
  acknowledgeSyllabus,
  type SavedSyllabus,
  type SyllabusRevision,
} from "@/lib/syllabus/saved";
import type { CatalogCourse, CatalogSection } from "@/lib/catalog/types";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusResult,
} from "@/lib/syllabus/types";

const empty: SavedSyllabus[] = [];
let previous: string | null | undefined;
let cached = empty;
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(PREFERENCES_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(PREFERENCES_EVENT, notify);
  };
}
function read() {
  try {
    const raw = browserStorage().getItem(SAVED_SYLLABI_KEY);
    if (raw !== previous) {
      previous = raw;
      cached = parseSavedSyllabi(raw);
    }
    return cached;
  } catch {
    return empty;
  }
}
function write(items: SavedSyllabus[]) {
  try {
    const raw = JSON.stringify(items);
    if (browserStorage().getItem(SAVED_SYLLABI_KEY) === raw) return true;
    browserStorage().setItem(SAVED_SYLLABI_KEY, raw);
    window.dispatchEvent(new Event(PREFERENCES_EVENT));
    return true;
  } catch {
    return false;
  }
}
export const savedSyllabiActions = {
  read,
  toggle(
    course: CatalogCourse,
    section: CatalogSection,
    entry: SyllabusEntry,
    result?: SyllabusResult<SyllabusDocument>,
  ) {
    const current = read(),
      existing = current.find((item) => item.id === entry.code);
    const added = !existing;
    if (
      !write(
        existing
          ? current.filter((item) => item.id !== entry.code)
          : [
              ...current,
              createSavedSyllabus(course, section, entry, result),
            ].slice(-200),
      )
    )
      return false;
    window.dispatchEvent(
      new CustomEvent("course-atlas:toast", {
        detail: {
          added,
          label: `${entry.subject} ${entry.catalogNumber} · #${section.classNumber}`,
          undo: () => {
            const latest = read();
            write(
              added
                ? latest.filter((item) => item.id !== entry.code)
                : latest.some((item) => item.id === entry.code)
                  ? latest
                  : [...latest, existing!].slice(-200),
            );
          },
        },
      }),
    );
    return true;
  },
  observe(result: SyllabusResult<SyllabusDocument>) {
    return write(
      read().map((item) =>
        item.id === result.data.entry.code
          ? observeSyllabus(item, result)
          : item,
      ),
    );
  },
  acknowledge(code: string, revision: SyllabusRevision) {
    return write(
      read().map((item) =>
        item.id === code ? acknowledgeSyllabus(item, revision) : item,
      ),
    );
  },
};
export function useSavedSyllabi() {
  const savedSyllabi = useSyncExternalStore(subscribe, read, () => empty);
  return { savedSyllabi, ...savedSyllabiActions };
}

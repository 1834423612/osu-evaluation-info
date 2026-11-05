"use client";
import { useSyncExternalStore } from "react";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { CatalogSection } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";

const LOCALE_KEY = "course-atlas:locale:v1";
const SAVED_KEY = "course-atlas:saved:v1";
const SAVED_SECTIONS_KEY = "course-atlas:saved-sections:v1";
const SAVED_INSTRUCTORS_KEY = "course-atlas:saved-instructors:v1";
const EVENT = "course-atlas:preferences";
const TOAST_EVENT = "course-atlas:toast";
const EMPTY: CatalogCourse[] = [];
const EMPTY_SECTIONS: SavedSection[] = [];
const EMPTY_INSTRUCTORS: SavedInstructor[] = [];
export type SavedSection = {
  id: string;
  courseId: string;
  courseLabel: string;
  courseTitle: string;
  term: string;
  campus: string;
  termCode?: string;
  campusCode?: string;
  section: CatalogSection;
};
export type SavedInstructor = {
  id: string;
  name: string;
  email: string | null;
  courses: {
    id: string;
    label: string;
    title: string;
    term: string;
    termCode?: string;
    campusCode?: string;
  }[];
};
let savedRaw: string | null = null;
let savedCache: CatalogCourse[] = EMPTY;
let savedSectionsRaw: string | null = null;
let savedSectionsCache: SavedSection[] = [];
let savedInstructorsRaw: string | null = null;
let savedInstructorsCache: SavedInstructor[] = [];
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}
function getLocale(): Locale {
  try {
    return localStorage.getItem(LOCALE_KEY) === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}
function getSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (raw === savedRaw) return savedCache;
    savedRaw = raw;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    savedCache = Array.isArray(parsed)
      ? parsed
          .filter(
            (v): v is CatalogCourse =>
              v && typeof v.id === "string" && Array.isArray(v.sections),
          )
          .slice(0, 100)
      : EMPTY;
  } catch {
    savedCache = EMPTY;
  }
  return savedCache;
}
function getSavedDetails<T>(key: string, type: "sections" | "instructors") {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return (type === "sections" ? EMPTY_SECTIONS : EMPTY_INSTRUCTORS) as T[];
  }
  const previous = type === "sections" ? savedSectionsRaw : savedInstructorsRaw;
  if (raw === previous)
    return (
      type === "sections" ? savedSectionsCache : savedInstructorsCache
    ) as T[];
  let parsed: T[] = [];
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(value)) parsed = value.slice(-200) as T[];
  } catch {
    parsed = [];
  }
  if (type === "sections") {
    savedSectionsRaw = raw;
    savedSectionsCache = parsed as SavedSection[];
    return savedSectionsCache as T[];
  }
  savedInstructorsRaw = raw;
  savedInstructorsCache = parsed as SavedInstructor[];
  return savedInstructorsCache as T[];
}
function writeArray(key: string, value: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}
function notifySaved(added: boolean, label: string, undo: () => void) {
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, { detail: { added, label, undo } }),
  );
}
function instructorKey(identity: string) {
  return nameDotNumberFromEmail(identity) ?? identity.trim().toLowerCase();
}
export function usePreferences() {
  const locale = useSyncExternalStore(
    subscribe,
    getLocale,
    () => "en" as Locale,
  );
  const saved = useSyncExternalStore(subscribe, getSaved, () => EMPTY);
  const savedSections = useSyncExternalStore(
    subscribe,
    () => getSavedDetails<SavedSection>(SAVED_SECTIONS_KEY, "sections"),
    () => EMPTY_SECTIONS,
  );
  const savedInstructors = useSyncExternalStore(
    subscribe,
    () =>
      getSavedDetails<SavedInstructor>(SAVED_INSTRUCTORS_KEY, "instructors"),
    () => EMPTY_INSTRUCTORS,
  );
  function setLocale(value: Locale) {
    try {
      localStorage.setItem(LOCALE_KEY, value);
    } catch {
      /* Storage may be disabled. */
    }
    document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
    window.dispatchEvent(new Event(EVENT));
  }
  function toggleSaved(course: CatalogCourse) {
    const current = getSaved();
    const next = current.some((item) => item.id === course.id)
      ? current.filter((item) => item.id !== course.id)
      : [...current, course].slice(-100);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    window.dispatchEvent(new Event(EVENT));
    const added = next.some((item) => item.id === course.id);
    notifySaved(added, `${course.subject} ${course.catalogNumber}`, () => {
      const latest = getSaved();
      const undone = added
        ? latest.filter((item) => item.id !== course.id)
        : latest.some((item) => item.id === course.id)
          ? latest
          : [...latest, course].slice(-100);
      try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(undone));
        window.dispatchEvent(new Event(EVENT));
      } catch {}
    });
    return true;
  }
  function toggleSection(course: CatalogCourse, section: CatalogSection) {
    const current = getSavedDetails<SavedSection>(
      SAVED_SECTIONS_KEY,
      "sections",
    );
    const id = `${course.id}:${section.classNumber}`;
    const previous = current.find((item) => item.id === id);
    const exists = Boolean(previous);
    const next = exists
      ? current.filter((item) => item.id !== id)
      : [
          ...current,
          {
            id,
            courseId: course.id,
            courseLabel: `${course.subject} ${course.catalogNumber}`,
            courseTitle: course.title,
            term: course.term,
            campus: course.campus,
            termCode: course.termCode,
            campusCode: course.campusCode,
            section,
          },
        ].slice(-200);
    if (!writeArray(SAVED_SECTIONS_KEY, next)) return false;
    const added = !exists;
    notifySaved(
      added,
      `${course.subject} ${course.catalogNumber} · ${section.section}`,
      () => {
        const latest = getSavedDetails<SavedSection>(
          SAVED_SECTIONS_KEY,
          "sections",
        );
        const undone = added
          ? latest.filter((item) => item.id !== id)
          : latest.some((item) => item.id === id)
            ? latest
            : [
                ...latest,
                previous ?? {
                  id,
                  courseId: course.id,
                  courseLabel: `${course.subject} ${course.catalogNumber}`,
                  courseTitle: course.title,
                  term: course.term,
                  campus: course.campus,
                  termCode: course.termCode,
                  campusCode: course.campusCode,
                  section,
                },
              ].slice(-200);
        writeArray(SAVED_SECTIONS_KEY, undone);
      },
    );
    return true;
  }
  function toggleInstructor(
    course: CatalogCourse,
    instructor: { name: string; email?: string | null },
  ) {
    const identity = instructorKey(instructor.email || instructor.name);
    const current = getSavedDetails<SavedInstructor>(
      SAVED_INSTRUCTORS_KEY,
      "instructors",
    );
    const existing = current.find(
      (item) => instructorKey(item.id || item.email || item.name) === identity,
    );
    const relatedCourse = {
      id: course.id,
      label: `${course.subject} ${course.catalogNumber}`,
      title: course.title,
      term: course.term,
      termCode: course.termCode,
      campusCode: course.campusCode,
    };
    const next = existing
      ? existing.courses.some((item) => item.id === course.id)
        ? current
            .map((item) =>
              item === existing
                ? {
                    ...item,
                    courses: item.courses.filter(
                      (related) => related.id !== course.id,
                    ),
                  }
                : item,
            )
            .filter((item) => item.courses.length > 0)
        : current.map((item) =>
            item === existing
              ? {
                  ...item,
                  courses: [...item.courses, relatedCourse].slice(-30),
                }
              : item,
          )
      : [
          ...current,
          {
            id: identity,
            name: instructor.name,
            email: instructor.email ?? null,
            courses: [relatedCourse],
          },
        ].slice(-200);
    if (!writeArray(SAVED_INSTRUCTORS_KEY, next)) return false;
    const added =
      !existing || !existing.courses.some((item) => item.id === course.id);
    notifySaved(added, instructor.name, () => {
      const latest = getSavedDetails<SavedInstructor>(
        SAVED_INSTRUCTORS_KEY,
        "instructors",
      );
      const currentInstructor = latest.find(
        (item) =>
          instructorKey(item.id || item.email || item.name) === identity,
      );
      if (added) {
        if (!currentInstructor) return;
        const courses = currentInstructor.courses.filter(
          (item) => item.id !== course.id,
        );
        writeArray(
          SAVED_INSTRUCTORS_KEY,
          courses.length
            ? latest.map((item) =>
                item === currentInstructor ? { ...item, courses } : item,
              )
            : latest.filter((item) => item !== currentInstructor),
        );
        return;
      }
      if (currentInstructor) {
        if (currentInstructor.courses.some((item) => item.id === course.id))
          return;
        writeArray(
          SAVED_INSTRUCTORS_KEY,
          latest.map((item) =>
            item === currentInstructor
              ? {
                  ...item,
                  courses: [...item.courses, relatedCourse].slice(-30),
                }
              : item,
          ),
        );
        return;
      }
      if (!existing) return;
      writeArray(
        SAVED_INSTRUCTORS_KEY,
        [
          ...latest,
          {
            ...existing,
            id: identity,
            courses: existing.courses,
          },
        ].slice(-200),
      );
    });
    return true;
  }
  return {
    locale,
    setLocale,
    saved,
    savedSections,
    savedInstructors,
    toggleSaved,
    toggleSection,
    toggleInstructor,
  };
}

"use client";
import { useSyncExternalStore } from "react";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { Locale } from "@/lib/i18n";

const LOCALE_KEY = "course-atlas:locale:v1";
const SAVED_KEY = "course-atlas:saved:v1";
const EVENT = "course-atlas:preferences";
const EMPTY: CatalogCourse[] = [];
let savedRaw: string | null = null;
let savedCache: CatalogCourse[] = EMPTY;
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
export function usePreferences() {
  const locale = useSyncExternalStore(
    subscribe,
    getLocale,
    () => "en" as Locale,
  );
  const saved = useSyncExternalStore(subscribe, getSaved, () => EMPTY);
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
    return true;
  }
  return { locale, setLocale, saved, toggleSaved };
}

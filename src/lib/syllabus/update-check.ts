"use client";
import { savedSyllabiActions } from "@/hooks/use-saved-syllabi";
import { loadSyllabusDocuments } from "./load-documents";

export type SyllabusUpdateCheck = {
  checked: number;
  failed: number;
  archived: number;
};
let pending: Promise<SyllabusUpdateCheck> | null = null;
let lastCheck = 0;
let lastIds = "";
export function checkSavedSyllabi(force = false) {
  if (pending) return pending;
  const entries = savedSyllabiActions.read().map((item) => item.entry);
  const ids = entries
    .map((entry) => entry.code)
    .sort()
    .join(",");
  if (!force && ids === lastIds && Date.now() - lastCheck < 5 * 60_000)
    return Promise.resolve(null);
  lastIds = ids;
  lastCheck = Date.now();
  const controller = new AbortController();
  const result: SyllabusUpdateCheck = { checked: 0, failed: 0, archived: 0 };
  const writes: Promise<void>[] = [];
  pending = loadSyllabusDocuments(
    entries,
    controller.signal,
    (_code, value) => {
      if (!value) result.failed++;
      else if (value.source === "backup") result.archived++;
      else {
        writes.push(
          savedSyllabiActions.observe(value).then((saved) => {
            if (saved) result.checked++;
            else result.failed++;
          }),
        );
      }
    },
    true,
  )
    .then(async () => {
      await Promise.all(writes);
      return result;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

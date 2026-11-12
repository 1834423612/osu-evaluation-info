import type { CatalogCourse, CatalogSection } from "../catalog/types.ts";
import {
  withoutCourseAvailability,
  withoutSectionAvailability,
} from "../catalog/availability.ts";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusResult,
} from "./types.ts";

export const SAVED_SYLLABI_KEY = "course-atlas:saved-syllabi:v1";
export type SyllabusRevision = Pick<
  SyllabusDocument,
  "snapshotId" | "modifiedAt"
>;
export type SavedSyllabus = {
  id: string;
  entry: SyllabusEntry;
  course: CatalogCourse;
  section: CatalogSection;
  savedAt: string;
  checkedAt: string | null;
  acknowledged: SyllabusRevision | null;
  latest: SyllabusRevision | null;
};
export function sameRevision(
  a: SyllabusRevision | null,
  b: SyllabusRevision | null,
) {
  return a?.snapshotId === b?.snapshotId && a?.modifiedAt === b?.modifiedAt;
}
export function syllabusHasUpdate(item: SavedSyllabus) {
  return Boolean(
    item.acknowledged &&
    item.latest &&
    !sameRevision(item.acknowledged, item.latest),
  );
}
export function documentMatchesEntry(
  document: SyllabusDocument,
  entry: SyllabusEntry,
) {
  return (
    document.entry.code === entry.code &&
    document.entry.entityId === entry.entityId &&
    document.entry.termId === entry.termId &&
    document.entry.classNumber === entry.classNumber
  );
}
export function createSavedSyllabus(
  course: CatalogCourse,
  section: CatalogSection,
  entry: SyllabusEntry,
  result?: SyllabusResult<SyllabusDocument>,
): SavedSyllabus {
  const document =
    result && documentMatchesEntry(result.data, entry) ? result.data : null;
  const revision = document
    ? { snapshotId: document.snapshotId, modifiedAt: document.modifiedAt }
    : null;
  return {
    id: entry.code,
    entry,
    course: withoutCourseAvailability({
      ...course,
      description: "",
      evaluation: undefined,
      sections: [],
    }),
    section: withoutSectionAvailability(section),
    savedAt: new Date().toISOString(),
    checkedAt:
      result?.source !== "backup" && document ? result!.fetchedAt : null,
    acknowledged: revision,
    latest: revision,
  };
}
/** Backups and stale responses cannot roll a notification backwards. Opening never acknowledges. */
export function observeSyllabus(
  item: SavedSyllabus,
  result: SyllabusResult<SyllabusDocument>,
): SavedSyllabus {
  if (
    result.source === "backup" ||
    !documentMatchesEntry(result.data, item.entry)
  )
    return item;
  const latest = {
    snapshotId: result.data.snapshotId,
    modifiedAt: result.data.modifiedAt,
  };
  if (
    item.checkedAt &&
    Date.parse(result.fetchedAt) < Date.parse(item.checkedAt)
  )
    return item;
  if (
    item.latest?.modifiedAt &&
    latest.modifiedAt &&
    Date.parse(latest.modifiedAt) < Date.parse(item.latest.modifiedAt)
  )
    return item;
  return {
    ...item,
    latest,
    acknowledged: item.acknowledged ?? latest,
    checkedAt: result.fetchedAt,
  };
}
/** Acknowledge exactly the version displayed; a newer unseen version stays unread. */
export function acknowledgeSyllabus(
  item: SavedSyllabus,
  revision: SyllabusRevision,
): SavedSyllabus {
  return sameRevision(item.latest, revision)
    ? { ...item, acknowledged: revision }
    : item;
}

export function parseSavedSyllabi(raw: string | null): SavedSyllabus[] {
  try {
    const values: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(values)) return [];
    return values
      .filter(
        (item): item is SavedSyllabus =>
          item &&
          typeof item.id === "string" &&
          item.id === item.entry?.code &&
          typeof item.course?.id === "string" &&
          Array.isArray(item.section?.instructors) &&
          Array.isArray(item.section?.meetings),
      )
      .slice(-200)
      .map((item) => ({
        ...item,
        course: withoutCourseAvailability(item.course),
        section: withoutSectionAvailability(item.section),
      }));
  } catch {
    return [];
  }
}

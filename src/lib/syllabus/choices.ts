import type { CatalogSection } from "../catalog/types.ts";
import { directoryRoleTone } from "../people/role-labels.ts";
import { syllabusTeacherKey, type SyllabusTeacherMap } from "./teacher-data.ts";
import type { SyllabusEntry } from "./types.ts";

export type SyllabusChoice = {
  entry: SyllabusEntry | null;
  section: CatalogSection;
  available: boolean;
  matches: boolean;
  score: number | null;
};
export type SyllabusChoiceFilters = {
  role: string;
  source: "RMP" | "SEI" | "SSLE";
  minimum: number;
  sort: "default" | "asc" | "desc";
};
export const DEFAULT_SYLLABUS_FILTERS: SyllabusChoiceFilters = {
  role: "all",
  source: "RMP",
  minimum: 0,
  sort: "default",
};

/** Keep every section. Unknown/missing scores never become zeros or match a minimum. */
export function syllabusChoices(
  items: { entry: SyllabusEntry; section: CatalogSection }[],
  sections: CatalogSection[],
  teachers: SyllabusTeacherMap,
  missing: ReadonlySet<string>,
  filters: SyllabusChoiceFilters,
): SyllabusChoice[] {
  const represented = new Set(items.map((item) => item.section.classNumber));
  const all = [
    ...items,
    ...sections
      .filter((section) => !represented.has(section.classNumber))
      .map((section) => ({ entry: null, section })),
  ];
  const rows = all.map(({ entry, section }, index) => {
    const people = section.instructors.map(
      (person) => teachers[syllabusTeacherKey(person)],
    );
    const values = people.flatMap((person) => {
      const score =
        filters.source === "RMP"
          ? person?.rmp?.quality
          : person?.[filters.source]?.score;
      return typeof score === "number" &&
        Number.isFinite(score) &&
        score >= 1 &&
        score <= 5
        ? [score]
        : [];
    });
    const score = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
    const roleMatch =
      filters.role === "all" ||
      (filters.role === "unknown"
        ? people.every((person) => !person?.roles?.length)
        : people.some((person) =>
            person?.roles?.some(
              (role) => directoryRoleTone(role.category) === filters.role,
            ),
          ));
    return {
      entry,
      section,
      index,
      available: Boolean(entry && !missing.has(entry.code)),
      matches:
        roleMatch &&
        (!filters.minimum || (score !== null && score >= filters.minimum)),
      score,
    };
  });
  return rows.sort(
    (a, b) =>
      Number(b.available) - Number(a.available) ||
      Number(b.matches) - Number(a.matches) ||
      (filters.sort === "default"
        ? 0
        : a.score === null
          ? b.score === null
            ? 0
            : 1
          : b.score === null
            ? -1
            : filters.sort === "asc"
              ? a.score - b.score
              : b.score - a.score) ||
      a.index - b.index,
  );
}

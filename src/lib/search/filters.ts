import type {
  CatalogCourse,
  CatalogFacet,
  CatalogSection,
} from "../catalog/types";
import type { CatalogCorpus } from "./catalog-source";
import { fold } from "./analyzer.ts";

// These are official facet codes, not search aliases. Unknown facet semantics
// are rejected rather than silently approximated (notably the evening facet).
const COMPONENTS: Record<string, string> = {
  lec: "Lecture",
  lab: "Laboratory",
  rec: "Recitation",
  sem: "Seminar",
  ind: "Independent Study",
  fld: "Field Experience",
  cln: "Clinical",
  wrk: "Workshop",
  std: "Studio",
  pract: "Practicum",
};
const MODES: Record<string, string> = {
  p: "In Person",
  dl: "Distance Learning",
  dh: "Distance Enhanced",
  hy: "Hybrid Delivery",
};
export class UnsupportedSearchFilter extends Error {}
const equal = (a: unknown, b: string) =>
  fold(String(a ?? "")).trim() === fold(b).trim();
const array = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value : [];
export function buildSearchFacets(corpus: CatalogCorpus): CatalogFacet[] {
  const facets = new Map<string, Map<string, CatalogFacet["items"][number]>>();
  for (const course of corpus.courses.values())
    for (const section of course.sections) {
      const raw = corpus.sections.get(section.id) ?? {},
        metadata =
          corpus.metadata.get(section.id) ??
          corpus.metadata.get(course.id) ??
          {};
      const seen = new Set<string>();
      const add = (slug: string, value: unknown, label: unknown = value) => {
        if (!value || seen.has(`${slug}:${value}`)) return;
        seen.add(`${slug}:${value}`);
        let items = facets.get(slug);
        if (!items) {
          items = new Map();
          facets.set(slug, items);
        }
        const key = String(value),
          item = items.get(key);
        if (item) item.count++;
        else
          items.set(key, {
            value: key,
            label: String(label ?? value),
            count: 1,
            selected: false,
          });
      };
      add("subject", course.subject.toLowerCase(), course.subjectName);
      add("campus", course.campusCode.toLowerCase(), course.campus);
      add(
        "academic-career",
        String(raw.career ?? "").toLowerCase(),
        metadata.academicCareer,
      );
      add(
        "class-session",
        String(raw.sessionCode ?? "").toLowerCase(),
        raw.sessionDescription,
      );
      add(
        "catalog-number",
        String(raw.catalogLevel ?? metadata.catalogLevel ?? "").toLowerCase(),
      );
      add(
        "academic-program",
        String(raw.secAcademicGroup ?? raw.academicGroup ?? "").toLowerCase(),
        metadata.academicGroup,
      );
      add(
        "component",
        Object.entries(COMPONENTS).find(([, label]) =>
          equal(label, String(raw.component ?? "")),
        )?.[0] ?? raw.component,
        raw.component,
      );
      add(
        "instruction-mode",
        Object.entries(MODES).find(([, label]) =>
          equal(label, String(raw.instructionMode ?? "")),
        )?.[0] ?? raw.instructionMode,
        raw.instructionMode,
      );
      for (const attribute of [
        ...array(metadata.courseAttributes),
        ...array(raw.attributes),
      ]) {
        add("class-attribute", String(attribute.name ?? "").toLowerCase());
        add("class-attribute-value", attribute.description);
        if (/^ge/i.test(String(attribute.name)))
          add("gen-categories", attribute.description);
      }
    }
  return [...facets].map(([slug, items]) => ({
    slug,
    title: slug,
    items: [...items.values()].sort((a, b) => a.label.localeCompare(b.label)),
  }));
}
export function matchingSections(
  corpus: CatalogCorpus,
  course: CatalogCourse,
  filters: Record<string, string> = {},
) {
  for (const key of Object.keys(filters))
    if (
      ![
        "component",
        "instruction-mode",
        "academic-career",
        "class-session",
        "catalog-number",
        "academic-program",
        "gen-categories",
        "class-attribute",
        "class-attribute-value",
      ].includes(key) &&
      filters[key]
    )
      throw new UnsupportedSearchFilter(`Unsupported index filter: ${key}`);
  return course.sections.filter((section: CatalogSection) => {
    const metadata =
      corpus.metadata.get(section.id) ?? corpus.metadata.get(course.id) ?? {};
    const raw = corpus.sections.get(section.id) ?? {};
    const attributes = [
      ...array(metadata.courseAttributes),
      ...array(raw.attributes),
    ];
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (
        key === "component" &&
        !equal(raw.component, COMPONENTS[value.toLowerCase()] ?? value)
      )
        return false;
      if (
        key === "instruction-mode" &&
        !equal(raw.instructionMode, MODES[value.toLowerCase()] ?? value)
      )
        return false;
      if (
        key === "academic-career" &&
        ![raw.career, metadata.academicCareer].some((item) =>
          equal(item, value),
        )
      )
        return false;
      if (key === "class-session" && !equal(raw.sessionCode, value))
        return false;
      if (
        key === "catalog-number" &&
        ![raw.catalogLevel, metadata.catalogLevel].some((item) =>
          equal(item, value),
        )
      )
        return false;
      if (
        key === "academic-program" &&
        ![raw.secAcademicGroup, raw.academicGroup, metadata.academicGroup].some(
          (item) => equal(item, value),
        )
      )
        return false;
      if (
        key === "class-attribute" &&
        !attributes.some((attribute) => equal(attribute.name, value))
      )
        return false;
      if (
        ["gen-categories", "class-attribute-value"].includes(key) &&
        !attributes.some(
          (attribute) =>
            equal(attribute.description, value) &&
            (!filters["class-attribute"] ||
              equal(attribute.name, filters["class-attribute"])),
        )
      )
        return false;
    }
    return true;
  });
}

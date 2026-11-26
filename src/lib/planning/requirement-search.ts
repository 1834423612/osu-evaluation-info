import type { CatalogCourse, CatalogResponse } from "../catalog/types";
/** Public GEN facet names, verified against the OSU catalog. No student data. */
const categories: [RegExp, string][] = [
  [
    /^Mathematical and Quantitative Reasoning(?:\/Data Analysis)?$/i,
    "GEN Foundation: Math & Quant Reason (or Data Anyl)",
  ],
  [/^(?:General )?World Languages?(?: Requirement)?$/i, "GEN: World Languages"],
  [/^Health and Well[- ]being$/i, "GEN Theme: Health and Well-being"],
  [/^Sustainability$/i, "GEN Theme: Sustainability"],
  [/^Lived Environments$/i, "GEN Theme: Lived Environments"],
  [/^Origins and Evolution$/i, "GEN Theme: Origins and Evolution"],
  [
    /^Migration,? Mobility,? (?:and|&) Immobility$/i,
    "GEN Theme: Migration, Mobility, and Immobility",
  ],
  [
    /^Traditions,? Cultures,? (?:and|&) Transformations$/i,
    "GEN Theme: Traditions, Cultures, & Transformations",
  ],
  [/^Number,? Nature,? (?:and|&) Mind$/i, "GEN Theme: Number, Nature, Mind"],
  [/^(?:GE |GEN )?Launch Seminar$/i, "GEN Bookend: Launch Seminar"],
  [
    /^(?:GE |GEN )?Reflection(?: Seminar)?$/i,
    "GEN Bookend: Reflection Seminar",
  ],
  [
    /^Historical and Cultural Studies$/i,
    "GEN Foundation: Historical and Cultural Studies",
  ],
  [
    /^Race, Ethnicity (?:and|&) Gender Diversity$/i,
    "GEN Foundation: Race, Ethnicity & Gender Diversity",
  ],
  [
    /^Literary, Visual (?:and|&) Performing Arts$/i,
    "GEN Foundation: Literary, Visual & Performing Arts",
  ],
  [
    /^Writing and Information Literacy$/i,
    "GEN Foundation: Writing and Information Literacy",
  ],
  [
    /^Social and Behavioral Sciences$/i,
    "GEN Foundation: Social and Behavioral Sciences",
  ],
  [/^Natural Sciences?$/i, "GEN Foundation: Natural Sciences"],
  [
    /^Citizenship for a Diverse (?:and|&) Just World(?: Options)?$/i,
    "GEN Theme: Citizenship for a Diverse & Just World",
  ],
];
export function requirementSearch(title: string) {
  const value = title
    .replace(/^Placeholder:\s*/i, "")
    .replace(/^Theme:\s*/i, "")
    .split(/\s+[–—-]\s+|\s*\(/)[0]
    .trim();
  return categories.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}
/** Attribute names verified against the official Spring 2027 catalog. */
export function requirementCatalogFilter(title: string) {
  const category = requirementSearch(title);
  if (category) return { key: "gen-categories", value: category };
  if (/^(?:Placeholder:\s*)?Civic Literacy\b/i.test(title))
    return { key: "class-attribute-value", value: "Civic Literacy" };
  if (/^Advanced Writing Literacy$/i.test(title))
    return {
      key: "class-attribute-value",
      value: "GEL Writing and Communication: level 2",
    };
  return null;
}
export function isGraduationConstraint(title: string) {
  return /\bGPA\b|\bresidency\b|\btotal degree hours\b|^\d+\s+(?:total\s+degree\s+)?hours$|^Upper Division|\bmilestone\b|refer to https?:|^Music Performance$|^Data Analytics$/i.test(
    title,
  );
}
export function courseFamilyQueries(
  query: string,
  suggestions: { query: string }[] = [],
) {
  const code = query.trim().match(/^([A-Z][A-Z&]+)\s+(\d{4})$/i);
  if (!code) return [];
  const prefix = `${code[1].toUpperCase()} ${code[2]}.`;
  return [
    ...new Set(
      suggestions.map((s) => s.query).filter((q) => q.startsWith(prefix)),
    ),
  ].slice(0, 4);
}

/** A missing base number offers choices; it never silently selects a decimal variant. */
export function courseFamilyCandidates<
  T extends { subject: string; catalogNumber: string },
>(subject: string, number: string, courses: T[]): T[] {
  if (!/^\d{3,5}$/.test(number)) return [];
  const family = new RegExp(`^${number}\\.\\d{1,3}[A-Z]{0,2}$`, "i");
  return [
    ...new Map(
      courses
        .filter(
          (course) =>
            course.subject.toUpperCase() === subject.toUpperCase() &&
            family.test(course.catalogNumber),
        )
        .map((course) => [`${course.subject}:${course.catalogNumber}`, course]),
    ).values(),
  ];
}

export async function readCourseFamilyCandidates(
  scope: { subject: string; number: string; campus: string; term: string },
  search: (url: string, init?: RequestInit) => Promise<CatalogResponse>,
  signal: AbortSignal,
): Promise<CatalogCourse[]> {
  const params = new URLSearchParams({
    q: `${scope.subject} ${scope.number}`,
    campus: scope.campus.toLowerCase(),
    term: scope.term,
    limit: "24",
    searchMode: "index",
  });
  const seen = new Set<string>();
  const courses: CatalogCourse[] = [];
  for (let page = 0; page < 100; page++) {
    signal.throwIfAborted();
    const result = await search("/api/catalog?" + params, { signal });
    signal.throwIfAborted();
    if (result.sourceMode !== "index")
      throw new Error(
        "A complete course-family archive is unavailable. Retry catalog search.",
      );
    courses.push(...result.courses);
    if (!result.hasMore)
      return courseFamilyCandidates(scope.subject, scope.number, courses);
    if (
      !result.nextCursor ||
      !result.nextCursor.startsWith("s:") ||
      seen.has(result.nextCursor)
    )
      throw new Error(
        "Course-family pagination could not continue. Retry catalog search.",
      );
    seen.add(result.nextCursor);
    params.set("cursor", result.nextCursor);
  }
  throw new Error(
    "This course family is too large to preview. Narrow your catalog search.",
  );
}

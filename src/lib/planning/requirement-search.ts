/** Public GEN facet names, verified against the OSU catalog. No student data. */
const categories: [RegExp, string][] = [
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

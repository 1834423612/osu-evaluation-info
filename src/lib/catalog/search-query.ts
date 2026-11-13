import type { CatalogCourse, CatalogFacet } from "./types";

const STOP = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "for",
  "in",
  "to",
  "with",
  "on",
  "at",
]);
// Legacy live-only hints. The primary engine derives its vocabulary and
// subject abbreviations from the full published catalog without this table.
const ALIASES: Record<string, string> = {
  cs: "CSE",
  compsci: "CSE",
  mat: "MATH",
  maths: "MATH",
  me: "MECHENG",
  mech: "MECHENG",
};
export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}
export function searchWords(value: string) {
  return (
    normalizeSearchText(value)
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}
export function queryWords(value: string) {
  return searchWords(value)
    .filter((word) => !STOP.has(word))
    .slice(0, 12);
}
function singular(word: string) {
  return word.endsWith("ies") && word.length > 4
    ? `${word.slice(0, -3)}y`
    : word.endsWith("s") && !word.endsWith("ss") && word.length > 4
      ? word.slice(0, -1)
      : word;
}
const compact = (value: string) => queryWords(value).map(singular).join("");
export function editDistance(a: string, b: string, maximum = 1) {
  if (a.length > 64 || b.length > 64 || Math.abs(a.length - b.length) > maximum)
    return maximum + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let beforePrevious = previous;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
    }
    beforePrevious = previous;
    previous = row;
  }
  return previous[b.length];
}
export type SearchSuggestion = {
  query: string;
  label: string;
  kind: "subject" | "course" | "number";
};
export type SearchPlan = {
  query: string;
  canonicalQuery: string;
  subject?: string;
  kind: "course" | "number" | "subject" | "keyword";
  suggestions: SearchSuggestion[];
  conflict: boolean;
};
export function planCatalogSearch(
  value: string,
  facets: CatalogFacet[],
  selectedSubject?: string,
): SearchPlan {
  const query = normalizeSearchText(value);
  const code = /^(.+?)\s*[-:#]?\s*(\d{1,6}(?:\.\d{1,3})?[a-z]{0,2})$/i.exec(
    query,
  );
  const subjectToken = code?.[1].trim() ?? query;
  const token = compact(subjectToken);
  const subjects = facets
    .filter((facet) => facet.slug === "subject")
    .flatMap((facet) =>
      facet.items.map((item) => ({
        code: item.value.toUpperCase(),
        label: item.label,
      })),
    );
  const direct = subjects.filter(
    (item) => compact(item.code) === token || compact(item.label) === token,
  );
  const alias = subjects.filter((item) => item.code === ALIASES[token]);
  const prefix =
    token.length >= 3
      ? subjects.filter(
          (item) =>
            compact(item.code).startsWith(token) ||
            compact(item.label).startsWith(token),
        )
      : [];
  const close =
    token.length >= 3
      ? subjects.filter(
          (item) =>
            editDistance(compact(item.code), token) === 1 ||
            editDistance(compact(item.label), token) === 1,
        )
      : [];
  const candidates = direct.length
    ? direct
    : alias.length
      ? alias
      : prefix.length
        ? prefix
        : close;
  // A three-letter title fragment such as "ani" can mean animation or animal sciences.
  const resolved =
    candidates.length === 1 &&
    (direct.length || alias.length || code || token.length >= 4)
      ? candidates[0]
      : undefined;
  const subject = resolved?.code;
  const number = code?.[2].toUpperCase();
  const numeric = /^\d{1,6}(?:\.\d{1,3})?[a-z]{0,2}$/i.test(query);
  const suggestions = resolved
    ? []
    : candidates.slice(0, 6).map((item) => ({
        query: number ? `${item.code} ${number}` : item.code,
        label: `${item.code} · ${item.label}`,
        kind: "subject" as const,
      }));
  const conflict = Boolean(
    subject && selectedSubject && subject !== selectedSubject.toUpperCase(),
  );
  return {
    query,
    canonicalQuery: subject
      ? number
        ? /^\d{3,5}(?:\.\d{1,3})?[a-z]{0,2}$/i.test(number)
          ? `${subject} ${number}`
          : number
        : ""
      : query,
    subject: subject ?? selectedSubject,
    kind:
      number && subject && /^\d{3,5}(?:\.\d{1,3})?[a-z]{0,2}$/i.test(number)
        ? "course"
        : numeric || (number && subject)
          ? "number"
          : subject && !number
            ? "subject"
            : "keyword",
    suggestions,
    conflict,
  };
}

function covers(needles: string[], words: string[], fuzzy = false) {
  return needles.every((needle) =>
    words.some(
      (word) =>
        singular(needle) === singular(word) ||
        (needle.length >= 3 && word.startsWith(needle)) ||
        (fuzzy && needle.length >= 5 && editDistance(needle, word) <= 1),
    ),
  );
}
/** Score course identity/title before descriptions. A prerequisite mention is never an exact code match. */
export function courseSearchScore(course: CatalogCourse, query: string) {
  const normalized = normalizeSearchText(query).toLowerCase();
  if (/^\d{1,6}(?:\.\d{1,3})?[a-z]{0,2}$/i.test(normalized)) {
    const catalog = course.catalogNumber.toLowerCase();
    return catalog === normalized
      ? 150
      : catalog.startsWith(normalized)
        ? 130
        : 0;
  }
  const words = queryWords(normalized);
  if (!words.length) return 0;
  const title = searchWords(course.title);
  const identity = searchWords(
    `${course.subject} ${course.subjectName} ${course.catalogNumber}`,
  );
  if (covers(words, title))
    return (
      100 +
      (title.join(" ").includes(words.join(" ")) ? 15 : 0) +
      Math.max(0, 10 - title.length)
    );
  if (covers(words, [...title, ...identity])) return 90;
  if (covers(words, identity)) return 85;
  if (covers(words, title, true)) return 70;
  const teachers = course.sections
    .flatMap((section) => section.instructors.map((person) => person.name))
    .join(" ");
  if (covers(words, searchWords(teachers))) return 65;
  if (
    covers(words, [...title, ...identity, ...searchWords(course.description)])
  )
    return 30;
  return 0;
}
export function officialKeywordQuery(query: string) {
  const words = queryWords(query);
  // OSU treats unqualified multiword input broadly. Explicit AND is supported;
  // quotes and wildcard syntax are not, so never send either as an approximation.
  return words.length > 1
    ? words.join(" AND ")
    : (words[0] ?? normalizeSearchText(query));
}

import { prerequisiteHeading } from "./prerequisite-heading.ts";
import type { CatalogCourse } from "./types";
const plainText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
export type CourseQueryField =
  "prereq" | "title" | "instructor" | "subject" | "number";
export type CourseQuery = {
  text: string;
  filters: { field: CourseQueryField; value: string }[];
};
export class CourseQueryError extends Error {}
const fields = new Set(["prereq", "title", "instructor", "subject", "number"]);
/** Shared by every catalog entry point; field clauses are ANDed, never fuzzy. */
export function parseCourseQuery(input: string): CourseQuery {
  if (input.length > 200)
    throw new CourseQueryError("Search is too long (maximum 200 characters).");
  const filters: CourseQuery["filters"] = [];
  const text = input
    .replace(
      /\b([a-z][a-z-]*):(?:"([^"\n]*)"|([^\s"]+))/gi,
      (
        _all,
        key: string,
        quoted: string | undefined,
        bare: string | undefined,
      ) => {
        const field = key.toLowerCase();
        if (!fields.has(field))
          throw new CourseQueryError(
            `Unknown search field: ${key}. Use prereq, title, instructor, subject or number.`,
          );
        const value = (quoted ?? bare ?? "").trim();
        if (!value) throw new CourseQueryError(`Empty ${key} filter.`);
        filters.push({ field: field as CourseQueryField, value });
        return " ";
      },
    )
    .trim()
    .replace(/\s+/g, " ");
  if (/\b[a-z][a-z-]*:/i.test(text) || text.includes('"'))
    throw new CourseQueryError(
      'Invalid field filter or unclosed quote. Example: prereq:"MATH 1151"',
    );
  if (filters.length > 12)
    throw new CourseQueryError("Too many search filters (maximum 12).");
  return { text, filters };
}
const normalize = (value: string) =>
  plainText(value)
    .normalize("NFKC")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .trim();
/** Preserve decimal suffixes and word boundaries: 1151.01 never matches 1151.02. */
function contains(haystack: string, needle: string) {
  const wanted = normalize(needle),
    value = normalize(haystack);
  if (!wanted) return false;
  const start = value.indexOf(wanted);
  if (start < 0) return false;
  let at = start;
  while (at >= 0) {
    const before = value[at - 1],
      after = value[at + wanted.length];
    if (
      (!before || before === " ") &&
      (!after ||
        after === " " ||
        (after === "." && !/\d/.test(value[at + wanted.length + 1] ?? "")))
    )
      return true;
    at = value.indexOf(wanted, at + 1);
  }
  return false;
}
export function prerequisiteText(description: string) {
  const value = plainText(description);
  const heading = prerequisiteHeading(value);
  if (!heading) return "";
  return value
    .slice(heading.end)
    .split(
      /\b(?:co[ -]?req(?:uisites?)?|not open|repeatable|cross[- ]listed|GE foundation|GE theme|credit hours)\b/i,
    )[0];
}
export function matchesCourseQuery(course: CatalogCourse, query: CourseQuery) {
  return query.filters.every(({ field, value }) => {
    if (field === "subject")
      return normalize(course.subject) === normalize(value);
    if (field === "number")
      return course.catalogNumber.toLowerCase() === value.toLowerCase();
    if (field === "instructor")
      return course.sections.some((s) =>
        s.instructors.some((instructor) => contains(instructor.name, value)),
      );
    const source =
      field === "prereq" ? prerequisiteText(course.description) : course.title;
    return contains(source, value);
  });
}

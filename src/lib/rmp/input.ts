import type { CourseRmpInput } from "./types";

export function parseRmpScope(
  value: unknown,
): CourseRmpInput["instructorScope"] {
  if (value === undefined || value === null) return undefined;
  if (value === "selected" || value === "course-history") return value;
  throw new RangeError("Invalid RMP instructor scope.");
}

export function normalizeRmpInput(input: CourseRmpInput): CourseRmpInput {
  const subject = input.subject.trim().toUpperCase();
  const catalogNumber = input.catalogNumber.trim().toUpperCase();
  const campus = input.campus.trim().toUpperCase();
  const instructorScope = parseRmpScope(input.instructorScope);
  if (
    !/^[A-Z][A-Z-]{0,19}$/.test(subject) ||
    !/^\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/.test(catalogNumber) ||
    !/^(COL|LMA|MNS|MRN|NWK|WST)$/.test(campus) ||
    input.usernames.length > 120
  )
    throw new RangeError("Invalid course or instructor selection.");
  const usernames = [
    ...new Set(input.usernames.map((value) => value.trim().toLowerCase())),
  ].sort();
  if (usernames.some((value) => !/^[a-z][a-z0-9_-]*\.[0-9]+$/.test(value)))
    throw new RangeError("Invalid OSU instructor identity.");
  return {
    subject,
    catalogNumber,
    campus,
    usernames,
    ...(instructorScope ? { instructorScope } : {}),
  };
}

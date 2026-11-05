export type ExactCourseQuery = { subject: string; catalogNumber: string };

/** Parse only a complete OSU subject/catalog code, never a numeric prefix. */
export function parseExactCourseQuery(
  query: string | null | undefined,
  requestedSubject?: string,
): ExactCourseQuery | null {
  const value = query?.trim() ?? "";
  const subject = requestedSubject?.trim() ?? "";
  const embedded = value.match(
    /^([a-z][a-z-]{0,19})\s*(\d{3,5}(?:\.\d{1,3})?[a-z]{0,2})$/i,
  );
  if (embedded) {
    if (subject && subject.toLowerCase() !== embedded[1].toLowerCase())
      return null;
    return {
      subject: embedded[1].toUpperCase(),
      catalogNumber: embedded[2].toUpperCase(),
    };
  }
  if (subject && /^\d{3,5}(?:\.\d{1,3})?[a-z]{0,2}$/i.test(value))
    return {
      subject: subject.toUpperCase(),
      catalogNumber: value.toUpperCase(),
    };
  return null;
}

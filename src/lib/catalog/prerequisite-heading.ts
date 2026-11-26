/** Shared navigation/search boundary; it does not interpret eligibility rules. */
export function prerequisiteHeading(description: string) {
  const found =
    /\b(?:pre[ -]?req(?:uisite)?s?(?:\s+or\s+concur(?:rent)?)?|prerequisites?\s+and\s+corequisites?)\s*[:.]/i.exec(
      description,
    );
  return found
    ? { start: found.index, end: found.index + found[0].length }
    : null;
}

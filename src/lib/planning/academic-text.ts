/** Only call at an identified academic title boundary, never on profile or notes. */
export function academicTitle(value: string): string | undefined {
  const title = value
    .normalize("NFKC")
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    !title ||
    title.length > 400 ||
    /@|https?:|\b\d{7,}\b|student\s*(?:id|name)|advisor|prepared\s+(?:by|for)|printed\s+by/i.test(
      title,
    )
  )
    return undefined;
  return title;
}

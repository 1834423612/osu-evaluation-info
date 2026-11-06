export type NormalizedCourseSearch = {
  searchTerm: string;
  searchType: "course_code" | "keyword";
};

export function normalizeCourseSearch(
  value: string,
): NormalizedCourseSearch | null {
  const query = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  if (!query) return null;
  const courseCode = query.match(
    /^([a-z]{2,8})\s*(\d{3,5}(?:\.\d{1,3})?[a-z]{0,2})$/i,
  );
  return courseCode
    ? {
        searchTerm: `${courseCode[1].toUpperCase()} ${courseCode[2].toUpperCase()}`,
        searchType: "course_code",
      }
    : { searchTerm: query.toLocaleLowerCase("en-US"), searchType: "keyword" };
}

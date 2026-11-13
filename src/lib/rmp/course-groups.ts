import type { CatalogCourse } from "../catalog/types.ts";
import type { RmpInstructor } from "./types.ts";
import { nameDotNumberFromEmail } from "../evaluations/scoring.ts";

const nameKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.sort()
    .join(" ") ?? "";

/** Group by this term's official roster; review dates do not establish a teaching term. */
export function groupCourseRmp(
  instructors: RmpInstructor[],
  course: Pick<CatalogCourse, "sections">,
) {
  const roster = course.sections.flatMap((section) => section.instructors);
  const usernames = new Set(
    roster.flatMap((person) => {
      const username = nameDotNumberFromEmail(person.email);
      return username ? [username] : [];
    }),
  );
  const names = new Map<string, Set<string>>();
  for (const person of roster) {
    const key = nameKey(person.name);
    if (!key) continue;
    const identities = names.get(key) ?? new Set<string>();
    const username = nameDotNumberFromEmail(person.email);
    if (username) identities.add(username);
    names.set(key, identities);
  }
  for (const [key, identities] of names)
    if (!identities.size) identities.add(key);
  const current: RmpInstructor[] = [],
    history: RmpInstructor[] = [];
  for (const instructor of instructors) {
    if (instructor.reviewCount <= 0) continue;
    const official = names.get(nameKey(instructor.name));
    const byAccount =
      !!instructor.nameDotNumber && usernames.has(instructor.nameDotNumber);
    // A unique name is only a grouping hint. It never changes association or scoring eligibility.
    const byName =
      official?.size === 1 &&
      (!instructor.nameDotNumber ||
        official.has(instructor.nameDotNumber) ||
        official.has(nameKey(instructor.name)));
    (byAccount || byName ? current : history).push(instructor);
  }
  return { current, history };
}

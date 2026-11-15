import type { CatalogCourse } from "./types.ts";
export function recommendationWeight(course: CatalogCourse) {
  const metric = course.evaluation?.primary,
    n = metric?.responseCount ?? 0,
    score = metric?.score ?? 3.5;
  const rating = (score * n + 3.6 * 20) / (n + 20);
  const evidence = Math.min(1, Math.log1p(n) / Math.log(201));
  const content =
    Number(!!course.description) +
    Number(course.sections.length > 0) +
    Number(course.attributes.length > 0);
  return Math.max(
    0.1,
    ((rating - 1) / 4) * 0.5 + evidence * 0.2 + (content / 3) * 0.15 + 0.15,
  );
}
export function sampleRecommendations(
  courses: CatalogCourse[],
  seed: string,
  limit = 20,
) {
  function random(key: string) {
    let hash = 2166136261;
    for (const c of seed + key) {
      hash ^= c.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) + 1) / 4294967297;
  }
  const ranked = courses
    .map((course) => ({
      course,
      rank: -Math.log(random(course.id)) / recommendationWeight(course),
    }))
    .sort((a, b) => a.rank - b.rank);
  const counts = new Map<string, number>();
  const diverse: CatalogCourse[] = [],
    rest: CatalogCourse[] = [];
  for (const { course } of ranked) {
    if ((counts.get(course.subject) ?? 0) >= 3) {
      rest.push(course);
      continue;
    }
    diverse.push(course);
    counts.set(course.subject, (counts.get(course.subject) ?? 0) + 1);
  }
  return [...diverse, ...rest].slice(0, limit);
}

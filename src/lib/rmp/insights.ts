import { normalizeRmpInput } from "./input.ts";
import type { CourseRmpInput, CourseRmpSummary } from "./types";

export type RmpInsight = {
  status: CourseRmpSummary["status"];
  identityBasis: "verified" | "unconfirmed" | "none";
  profileCount: number;
  tags: { tag: string; count: number }[];
  difficulty: number | null;
  quality: number | null;
  qualityCount: number;
  difficultyCount: number;
  difficultyPeriod: "recent" | "historical" | "none";
  reviewCount: number;
  matchedInstructorCount: number;
  requestedInstructorCount: number;
  recentSince: string;
};

export function aggregateRmpInsights(summary: CourseRmpSummary): RmpInsight {
  const allProfiles = [
    ...new Map(
      summary.instructors.map((item) => [item.professorId, item]),
    ).values(),
  ];
  const confirmed = allProfiles.filter(
    (item) => item.association === "verified" && item.reviewCount > 0,
  );
  // Unconfirmed profiles retain their own scores, but never enter course totals.
  const professors = confirmed;
  const displayed = confirmed.length
    ? confirmed
    : allProfiles.filter((item) => item.reviewCount > 0);
  const tags = new Map<string, { tag: string; count: number }>();
  let qualityTotal = 0,
    qualityCount = 0;
  let total = 0,
    count = 0,
    historicalTotal = 0,
    historicalCount = 0;
  for (const professor of professors) {
    if (
      typeof professor.recentQuality === "number" &&
      professor.recentQuality >= 1 &&
      professor.recentQuality <= 5 &&
      professor.recentQualityCount > 0
    ) {
      qualityTotal += professor.recentQuality * professor.recentQualityCount;
      qualityCount += professor.recentQualityCount;
    }
    if (
      professor.recentDifficulty !== null &&
      professor.recentDifficulty >= 1 &&
      professor.recentDifficulty <= 5 &&
      professor.recentDifficultyCount > 0
    ) {
      total += professor.recentDifficulty * professor.recentDifficultyCount;
      count += professor.recentDifficultyCount;
    }
    if (
      professor.historicalDifficulty !== null &&
      professor.historicalDifficulty >= 1 &&
      professor.historicalDifficulty <= 5 &&
      professor.historicalDifficultyCount > 0
    ) {
      historicalTotal +=
        professor.historicalDifficulty * professor.historicalDifficultyCount;
      historicalCount += professor.historicalDifficultyCount;
    }
    for (const item of professor.topTags) {
      const tag = item.tag.trim(),
        identity = tag.toLowerCase();
      if (!tag || !Number.isFinite(item.count) || item.count <= 0) continue;
      const existing = tags.get(identity);
      tags.set(identity, {
        tag: existing?.tag ?? tag,
        count: (existing?.count ?? 0) + item.count,
      });
    }
  }
  return {
    status: summary.status,
    identityBasis: confirmed.length
      ? "verified"
      : displayed.length
        ? "unconfirmed"
        : "none",
    profileCount: displayed.length,
    quality: qualityCount ? qualityTotal / qualityCount : null,
    qualityCount,
    tags: [...tags.values()]
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 12),
    difficulty: count
      ? total / count
      : historicalCount
        ? historicalTotal / historicalCount
        : null,
    difficultyCount: count || historicalCount,
    difficultyPeriod: count
      ? "recent"
      : historicalCount
        ? "historical"
        : "none",
    reviewCount: displayed.reduce((sum, item) => sum + item.reviewCount, 0),
    matchedInstructorCount: summary.matchedInstructorCount,
    requestedInstructorCount: summary.requestedInstructorCount,
    recentSince: summary.recentSince,
  };
}

export function parseRmpPreviewBatch(
  value: unknown,
): (CourseRmpInput & { id: string })[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { courses?: unknown }).courses)
  )
    throw new RangeError("Invalid course batch");
  const courses = (value as { courses: unknown[] }).courses;
  if (courses.length > 24) throw new RangeError("At most 24 courses");
  const ids = new Set<string>();
  return courses.map((value) => {
    const item = value as CourseRmpInput & { id: string };
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 180 ||
      ids.has(item.id) ||
      typeof item.subject !== "string" ||
      typeof item.catalogNumber !== "string" ||
      typeof item.campus !== "string" ||
      !Array.isArray(item.usernames) ||
      item.usernames.some((value) => typeof value !== "string")
    )
      throw new RangeError("Invalid course");
    ids.add(item.id);
    return { ...normalizeRmpInput(item), id: item.id };
  });
}

export function rmpTagTone(tag: string) {
  if (/homework|workload|assignment|attendance|reading/i.test(tag))
    return "work";
  if (/test|exam|quiz|grade|grader/i.test(tag)) return "assessment";
  if (/tough|difficult|hard|strict/i.test(tag)) return "challenge";
  if (/helpful|caring|clear|amazing|respected/i.test(tag)) return "positive";
  return "neutral";
}

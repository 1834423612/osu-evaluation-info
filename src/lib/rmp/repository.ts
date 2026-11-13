import { COURSE_SQL, REVIEW_PAGE_SQL } from "./queries";
import { isDatabaseConfigured, queryDatabase } from "@/lib/db";
import { normalizeRmpInput } from "./input";
import {
  MAX_REVIEW_OFFSET,
  normalizeReviewOffset,
  REVIEW_PAGE_SIZE,
} from "./pagination";
import type {
  CourseRmpInput,
  CourseRmpSummary,
  RmpInstructor,
  RmpReview,
} from "./types";

const CACHE_TTL = 5 * 60_000;
const MAX_ENTRIES = 100;
const cache = new Map<string, { expiresAt: number; value: CourseRmpSummary }>();
const pending = new Map<string, Promise<CourseRmpSummary>>();

// Summaries and pagination share profile selection; reviews stay course/campus scoped.

type CourseRow = {
  professor_id: string;
  name_dot_number: string | null;
  association: RmpInstructor["association"];
  display_name: string;
  review_count: number;
  recent_review_count: number;
  recent_quality: number | null;
  recent_difficulty: number | null;
  recent_quality_count: number;
  recent_difficulty_count: number;
  historical_quality: number | null;
  historical_quality_count: number;
  historical_difficulty: number | null;
  historical_difficulty_count: number;
  latest_review_date: string | null;
  refreshed_at: string | null;
  reviews: RmpInstructor["reviews"];
  top_tags: { tag: string; count: number }[];
};

export async function getCourseRmp(
  rawInput: CourseRmpInput,
  options: { preview?: boolean; bypassCache?: boolean } = {},
): Promise<CourseRmpSummary> {
  const input = normalizeRmpInput(rawInput);
  const today = new Date();
  today.setUTCFullYear(today.getUTCFullYear() - 2);
  const recentSince = today.toISOString().slice(0, 10);
  const empty: CourseRmpSummary = {
    status: "no-data",
    instructors: [],
    requestedInstructorCount: input.usernames.length,
    matchedInstructorCount: 0,
    recentSince,
    refreshedAt: null,
  };
  if (!input.usernames.length && input.instructorScope !== "course-history")
    return empty;
  const key = JSON.stringify([input, recentSince, !!options.preview]);
  const cached = cache.get(key);
  if (!options.bypassCache && cached && cached.expiresAt > Date.now())
    return cached.value;
  const running = pending.get(key);
  if (running) return running;
  if (pending.size >= MAX_ENTRIES) return { ...empty, status: "unavailable" };
  const request = (async (): Promise<CourseRmpSummary> => {
    try {
      if (!isDatabaseConfigured()) throw new Error("RMP database unavailable");
      const result = await queryDatabase<CourseRow>(COURSE_SQL, [
        input.usernames,
        input.campus,
        `${input.subject}${input.catalogNumber}`.replace(/[\s_-]/g, ""),
        recentSince,
        !options.preview,
        input.instructorScope === "course-history",
      ]);
      const instructors: RmpInstructor[] = result.rows.map((row) => ({
        professorId: row.professor_id,
        nameDotNumber: row.name_dot_number,
        association: row.association,
        name: row.display_name,
        profileUrl: `https://www.ratemyprofessors.com/professor/${row.professor_id}`,
        reviewCount: row.review_count,
        recentReviewCount: row.recent_review_count,
        recentQuality: row.recent_quality,
        recentDifficulty: row.recent_difficulty,
        recentQualityCount: row.recent_quality_count,
        recentDifficultyCount: row.recent_difficulty_count,
        historicalQuality: row.historical_quality,
        historicalQualityCount: row.historical_quality_count,
        historicalDifficulty: row.historical_difficulty,
        historicalDifficultyCount: row.historical_difficulty_count,
        latestReviewDate: row.latest_review_date,
        reviews: row.reviews,
        topTags: row.top_tags,
      }));
      const refreshed = result.rows
        .flatMap((row) => (row.refreshed_at ? [row.refreshed_at] : []))
        .sort();
      return {
        ...empty,
        status: instructors.some((item) => item.reviewCount > 0)
          ? "available"
          : "no-data",
        instructors,
        matchedInstructorCount: new Set(
          instructors.flatMap((item) =>
            item.association === "verified" && item.nameDotNumber
              ? [item.nameDotNumber]
              : [],
          ),
        ).size,
        refreshedAt: refreshed.at(-1) ?? null,
      };
    } catch {
      return { ...empty, status: "unavailable" };
    }
  })();
  pending.set(key, request);
  try {
    const value = await request;
    cache.delete(key);
    while (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    cache.set(key, {
      expiresAt:
        Date.now() + (value.status === "unavailable" ? 30_000 : CACHE_TTL),
      value,
    });
    return value;
  } finally {
    pending.delete(key);
  }
}

/** Return a bounded page of course-specific reviews using the same scoped profile selection as the summary. */
export async function getInstructorRmpReviews(
  rawInput: CourseRmpInput,
  rawProfessorId: string,
  rawOffset = 0,
): Promise<{ reviews: RmpReview[]; total: number; nextOffset: number | null }> {
  const input = normalizeRmpInput(rawInput);
  if (!/^\d{1,18}$/.test(rawProfessorId))
    throw new RangeError("Invalid RMP professor ID.");
  const offset = normalizeReviewOffset(rawOffset);
  if (!input.usernames.length && input.instructorScope !== "course-history")
    return { reviews: [], total: 0, nextOffset: null };
  const result = await queryDatabase<{ total: number; reviews: RmpReview[] }>(
    REVIEW_PAGE_SQL,
    [
      input.usernames,
      input.campus,
      `${input.subject}${input.catalogNumber}`.replace(/[\s_-]/g, ""),
      REVIEW_PAGE_SIZE,
      rawProfessorId,
      offset,
      input.instructorScope === "course-history",
    ],
  );
  const row = result.rows[0] ?? { total: 0, reviews: [] };
  return {
    reviews: row.reviews,
    total: row.total,
    nextOffset:
      row.reviews.length > 0 &&
      offset + row.reviews.length < row.total &&
      offset + row.reviews.length <= MAX_REVIEW_OFFSET
        ? offset + row.reviews.length
        : null,
  };
}

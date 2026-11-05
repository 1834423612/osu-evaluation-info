import { isDatabaseConfigured, queryDatabase } from "@/lib/db";
import { normalizeRmpInput } from "./input";
import type { CourseRmpInput, CourseRmpSummary, RmpInstructor } from "./types";

const CACHE_TTL = 5 * 60_000;
const MAX_ENTRIES = 100;
const cache = new Map<string, { expiresAt: number; value: CourseRmpSummary }>();
const pending = new Map<string, Promise<CourseRmpSummary>>();

// Each LATERAL lookup starts from a selected, accepted profile. No raw reviews
// are read for catalog result lists or for another course/campus.
const COURSE_SQL = `
  WITH matched AS (
    SELECT DISTINCT m.professor_id, m.name_dot_number, i.display_name
    FROM osu_rmp.professor_identity_map m
    JOIN osu_rmp.instructor_identity i USING (name_dot_number)
    JOIN osu_rmp.professor p ON p.legacy_id = m.professor_id AND p.active
    WHERE m.state = 'accepted' AND m.name_dot_number = ANY($1::text[])
      AND EXISTS (
        SELECT 1 FROM osu_rmp.professor_school ps
        JOIN osu_rmp.school s ON s.legacy_id = ps.school_id
        WHERE ps.professor_id = p.legacy_id AND s.campus_code = $2
      )
    ORDER BY m.name_dot_number, m.professor_id
    LIMIT 40
  )
  SELECT m.professor_id::text, m.name_dot_number, m.display_name,
    stats.review_count, stats.recent_review_count,
    stats.recent_quality, stats.recent_difficulty,
    stats.recent_quality_count, stats.recent_difficulty_count,
    stats.latest_review_date, stats.refreshed_at,
    coalesce(comments.reviews, '[]'::jsonb) AS reviews
  FROM matched m
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS review_count,
      count(*) FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::int AS recent_review_count,
      avg(coalesce((r.helpful_rating + r.clarity_rating) / 2, r.helpful_rating, r.clarity_rating))
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::float8 AS recent_quality,
      avg(r.difficulty_rating)
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::float8 AS recent_difficulty,
      count(coalesce(r.helpful_rating, r.clarity_rating))
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::int AS recent_quality_count,
      count(r.difficulty_rating)
        FILTER (WHERE r.review_date BETWEEN $4::date AND CURRENT_DATE)::int AS recent_difficulty_count,
      max(r.review_date)::text AS latest_review_date,
      max(r.updated_at)::text AS refreshed_at
    FROM osu_rmp.review_query r
    WHERE r.professor_id = m.professor_id AND r.course_key = $3
  ) stats
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'id', recent.legacy_id::text,
      'date', recent.review_date::text,
      'quality', coalesce((recent.helpful_rating + recent.clarity_rating) / 2,
        recent.helpful_rating, recent.clarity_rating),
      'difficulty', recent.difficulty_rating,
      'comment', left(coalesce(recent.comment, ''), 4000),
      'tags', recent.rating_tags,
      'wouldTakeAgain', recent.would_take_again
    ) ORDER BY recent.review_date DESC NULLS LAST, recent.legacy_id DESC) AS reviews
    FROM (
      SELECT r.* FROM osu_rmp.review_query r
      WHERE r.professor_id = m.professor_id AND r.course_key = $3
      ORDER BY r.review_date DESC NULLS LAST, r.legacy_id DESC LIMIT 3
    ) recent
  ) comments ON true
  ORDER BY m.display_name, m.professor_id
`;

type CourseRow = {
  professor_id: string;
  name_dot_number: string;
  display_name: string;
  review_count: number;
  recent_review_count: number;
  recent_quality: number | null;
  recent_difficulty: number | null;
  recent_quality_count: number;
  recent_difficulty_count: number;
  latest_review_date: string | null;
  refreshed_at: string | null;
  reviews: RmpInstructor["reviews"];
};

export async function getCourseRmp(
  rawInput: CourseRmpInput,
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
  if (!input.usernames.length) return empty;
  const key = JSON.stringify([input, recentSince]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
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
      ]);
      const instructors: RmpInstructor[] = result.rows.map((row) => ({
        professorId: row.professor_id,
        nameDotNumber: row.name_dot_number,
        name: row.display_name,
        profileUrl: `https://www.ratemyprofessors.com/professor/${row.professor_id}`,
        reviewCount: row.review_count,
        recentReviewCount: row.recent_review_count,
        recentQuality: row.recent_quality,
        recentDifficulty: row.recent_difficulty,
        recentQualityCount: row.recent_quality_count,
        recentDifficultyCount: row.recent_difficulty_count,
        latestReviewDate: row.latest_review_date,
        reviews: row.reviews,
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
          instructors.map((item) => item.nameDotNumber),
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

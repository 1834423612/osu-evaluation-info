import { queryDatabase } from "../db.ts";
import { normalizeOfficialCourse } from "./official-client";
import {
  LATEST_CATALOG_TERM_SQL,
  FIND_CATALOG_SNAPSHOT_SQL,
} from "./snapshot-policy";
import { getCourseEvaluations } from "../evaluations/repository";
import { sampleRecommendations } from "./recommendation-score";
import {
  exchangeItemSchema,
  itemHref,
  itemKey,
  itemTitle,
  itemContext,
  type ExchangeItem,
} from "../saved/exchange";
import type { PopularItem, PopularKind } from "../user-data/statistics";
async function loadRecommendedItems(
  kind: PopularKind,
  subject: string,
  seed: string,
): Promise<PopularItem[]> {
  const term = (
    await queryDatabase<{ term_code: string }>(LATEST_CATALOG_TERM_SQL)
  ).rows[0]?.term_code;
  if (!term) return [];
  const run = (
    await queryDatabase<{ id: string }>(FIND_CATALOG_SNAPSHOT_SQL, [term, null])
  ).rows[0]?.id;
  if (!run) return [];
  const rows = (
    await queryDatabase<{
      data: Record<string, unknown>;
      sections: Record<string, unknown>[];
    }>(
      "WITH candidates AS (SELECT DISTINCT ON(subject,catalog_number,campus_code) subject,catalog_number,campus_code,data FROM osu_catalog.course_snapshots WHERE last_seen_run=$1::uuid AND term_code=$2 AND campus_code='COL' AND ($3='' OR subject=$3) ORDER BY subject,catalog_number,campus_code,course_id) SELECT c.data,coalesce((SELECT json_agg(s.data ORDER BY s.class_number) FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=$1::uuid AND s.term_code=$2 AND s.subject=c.subject AND s.catalog_number=c.catalog_number AND s.campus_code=c.campus_code),'[]'::json) AS sections FROM candidates c ORDER BY md5(c.subject||c.catalog_number||$4) LIMIT 48",
      [run, term, subject, seed],
    )
  ).rows;
  const courses = rows.map((row) =>
    normalizeOfficialCourse({ course: row.data, sections: row.sections }, term),
  );
  const ratings = await getCourseEvaluations(
    courses.map((course) => ({
      subject: course.subject,
      catalogNumber: course.catalogNumber,
      campus: course.campusCode,
      instructors: course.sections.flatMap((s) => s.instructors),
    })),
  );
  for (const course of courses)
    course.evaluation = ratings[course.subject + " " + course.catalogNumber];
  const chosen = sampleRecommendations(courses, seed, 30),
    items: PopularItem[] = [],
    seen = new Set<string>();
  for (const course of chosen) {
    let item: ExchangeItem;
    if (kind === "course")
      item = exchangeItemSchema.parse({ kind: "course", payload: course });
    else if (kind === "section") {
      const section = course.sections[0];
      if (!section) continue;
      item = exchangeItemSchema.parse({
        kind: "section",
        payload: {
          id: course.id + ":" + section.classNumber,
          courseId: course.id,
          courseLabel: course.subject + " " + course.catalogNumber,
          courseTitle: course.title,
          term: course.term,
          termCode: course.termCode,
          campus: course.campus,
          campusCode: course.campusCode,
          section,
        },
      });
    } else {
      const teacher = course.sections
        .flatMap((s) => s.instructors)
        .find((x) => x.email && /@osu\.edu$/i.test(x.email));
      if (!teacher) continue;
      item = {
        kind: "instructor",
        payload: {
          id: teacher.email!.split("@")[0],
          name: teacher.name,
          email: null,
          courses: [
            {
              id: course.id,
              label: course.subject + " " + course.catalogNumber,
              title: course.title,
              term: course.term,
              termCode: course.termCode,
              campusCode: course.campusCode,
            },
          ],
        },
      };
    }
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      kind,
      label: itemTitle(item),
      context: itemContext(item),
      href: itemHref(item),
      ...(kind !== "instructor"
        ? {
            course,
            focusSection:
              item.kind === "section"
                ? item.payload.section.classNumber
                : undefined,
          }
        : {}),
    });
  }
  return items.slice(0, 20);
}

let subjectCache: { until: number; value: Promise<string[]> } | null = null;
export function recommendationSubjects() {
  if (subjectCache && subjectCache.until > Date.now())
    return subjectCache.value;
  const value = (async () => {
    const term = (
      await queryDatabase<{ term_code: string }>(LATEST_CATALOG_TERM_SQL)
    ).rows[0]?.term_code;
    if (!term) return [];
    const run = (
      await queryDatabase<{ id: string }>(FIND_CATALOG_SNAPSHOT_SQL, [
        term,
        null,
      ])
    ).rows[0]?.id;
    if (!run) return [];
    return (
      await queryDatabase<{ subject: string }>(
        "SELECT DISTINCT subject FROM osu_catalog.course_snapshots WHERE last_seen_run=$1::uuid AND term_code=$2 AND campus_code='COL' ORDER BY subject LIMIT 500",
        [run, term],
      )
    ).rows.map((row) => row.subject);
  })();
  subjectCache = { until: Date.now() + 60000, value };
  return value;
}

const recommendationCache = new Map<
  string,
  { until: number; value: Promise<PopularItem[]> }
>();
export function recommendedItems(
  kind: PopularKind,
  subject: string,
  seed: string,
) {
  const key = kind + ":" + subject + ":" + seed,
    old = recommendationCache.get(key);
  if (old && old.until > Date.now()) return old.value;
  const value = loadRecommendedItems(kind, subject, seed);
  recommendationCache.set(key, { until: Date.now() + 60000, value });
  if (recommendationCache.size > 96)
    recommendationCache.delete(recommendationCache.keys().next().value!);
  void value.catch(() => recommendationCache.delete(key));
  return value;
}

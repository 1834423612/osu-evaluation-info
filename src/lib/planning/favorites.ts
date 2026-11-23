import {
  courseForItem,
  itemKey,
  type ExchangeItem,
} from "../saved/exchange.ts";
import { planSchema, type Plan } from "./model.ts";
import { addPlanningCourse, boardCourses } from "./workspace.ts";
export function favoritePlanCourses(items: ExchangeItem[]) {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    if (item.kind === "instructor") return [];
    const course = courseForItem(item);
    if (!course) return [];
    const key = course.subject + " " + course.catalogNumber;
    if (
      seen.has(key) ||
      !/^[A-Z][A-Z& ]{1,11}$/.test(course.subject) ||
      !/^\d{4}(?:\.\d{1,2})?[A-Z]?$/.test(course.catalogNumber)
    )
      return [];
    seen.add(key);
    return [
      {
        key: itemKey(item),
        subject: course.subject,
        number: course.catalogNumber,
        title: course.title,
        campus: course.campusCode,
        term: course.term,
        credits:
          item.kind === "section" && item.payload.creditsMin === undefined
            ? null
            : course.creditsMin === course.creditsMax
              ? course.creditsMin
              : null,
      },
    ];
  });
}
export function importFavoriteCourses(
  plan: Plan,
  items: ExchangeItem[],
  term: string,
  id: () => string,
) {
  let next = plan,
    added = 0,
    skipped = 0;
  for (const favorite of favoritePlanCourses(items)) {
    // Re-importing never moves an existing course or changes protected records.
    if (
      boardCourses(next).some(
        ({ course }) =>
          course.subject === favorite.subject &&
          course.number === favorite.number &&
          !["withdrawn", "dropped", "failed"].includes(course.status),
      )
    ) {
      skipped++;
      continue;
    }
    const previousIds = new Set(
      next.semesters.flatMap((s) => s.courses.map((c) => c.id)),
    );
    next = addPlanningCourse(next, favorite, term, id);
    next.semesters = next.semesters.map((semester) => ({
      ...semester,
      courses: semester.courses.map((course) =>
        course.id &&
        !previousIds.has(course.id) &&
        course.subject === favorite.subject &&
        course.number === favorite.number
          ? { ...course, title: favorite.title, credits: favorite.credits }
          : course,
      ),
    }));
    added++;
  }
  return { plan: planSchema.parse(next), added, skipped };
}

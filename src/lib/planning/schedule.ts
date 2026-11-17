import { planSchema, type Plan, type PlanCourse } from "./model.ts";
export function termOrder(a: string, b: string) {
  const seasons: Record<string, number> = { Spring: 0, Summer: 1, Autumn: 2 };
  const value = (s: string) =>
    Number(s.match(/20\d{2}/)?.[0] ?? 0) * 4 +
    (seasons[s.replace(/20\d{2}| /g, "")] ?? 0);
  return value(a) - value(b);
}
export function scheduledTerm(
  plan: Plan,
  courseId: string,
  original: string | null,
) {
  const placement = plan.schedule.placements.find(
    (p) => p.courseId === courseId,
  );
  return placement ? placement.term : original;
}
export function placeCourse(
  plan: Plan,
  courseId: string,
  term: string | null,
): Plan {
  const semester = plan.semesters.find((s) =>
    s.courses.some((c) => c.id === courseId),
  );
  const course = semester?.courses.find((c) => c.id === courseId);
  const protectedRecord =
    course?.subject &&
    course.number &&
    plan.semesters.some((entry) =>
      entry.courses.some(
        (record) =>
          record.evidenceRole !== "option" &&
          record.subject === course.subject &&
          record.number === course.number &&
          (record.status === "completed" ||
            record.status === "in-progress" ||
            entry.creditOrigin === "transfer" ||
            entry.creditOrigin === "exam"),
      ),
    );
  if (
    protectedRecord ||
    !course ||
    course.evidenceRole === "option" ||
    ["withdrawn", "dropped", "failed"].includes(course.status) ||
    course.status === "completed" ||
    course.status === "in-progress" ||
    semester?.creditOrigin === "transfer" ||
    semester?.creditOrigin === "exam"
  )
    throw Error("Course cannot be moved");
  return planSchema.parse({
    ...plan,
    reviewed: false,
    schedule: {
      ...plan.schedule,
      terms: [
        ...new Set([...plan.schedule.terms, ...(term ? [term] : [])]),
      ].sort(termOrder),
      placements: [
        ...plan.schedule.placements.filter((p) => p.courseId !== courseId),
        { courseId, term },
      ],
    },
  });
}
/** A lower bound for a semester, never a degree-credit total. */
export function semesterCredits(courses: PlanCourse[]) {
  const credits = new Map<string, Set<number | null>>();
  let placeholders = 0;
  for (const c of courses) {
    if (["withdrawn", "dropped", "failed"].includes(c.status)) continue;
    if (c.kind === "placeholder") {
      placeholders++;
      continue;
    }
    if (c.evidenceRole !== "observation") continue;
    const key = c.subject && c.number ? c.subject + " " + c.number : c.id;
    if (!key) continue;
    const values = credits.get(key) ?? new Set<number | null>();
    values.add(c.credits);
    credits.set(key, values);
  }
  let known = 0,
    unknown = placeholders;
  for (const values of credits.values()) {
    if (values.size === 1 && !values.has(null)) known += [...values][0]!;
    else unknown++;
  }
  return { known, unknown, distinctCourses: credits.size, placeholders };
}

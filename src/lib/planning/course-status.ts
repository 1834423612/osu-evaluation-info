import { planSchema, type Plan, type PlanCourse } from "./model.ts";
/** Personal annotations never replace the status reported by an academic source. */
export function setCourseUserStatus(
  plan: Plan,
  id: string,
  userStatus: PlanCourse["userStatus"],
) {
  if (!plan.semesters.some((s) => s.courses.some((c) => c.id === id)))
    throw Error("course_removed");
  return planSchema.parse({
    ...plan,
    semesters: plan.semesters.map((s) => ({
      ...s,
      courses: s.courses.map((c) => (c.id === id ? { ...c, userStatus } : c)),
    })),
  });
}

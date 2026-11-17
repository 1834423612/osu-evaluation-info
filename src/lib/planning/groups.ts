import { planSchema, type Plan } from "./model.ts";
import { planningPrograms, requirementCodes } from "./programs.ts";
import { requirementSearch } from "./requirement-search.ts";
import { placeCourse } from "./schedule.ts";
import { addPlanningCourse } from "./workspace.ts";
export type CourseGroup = NonNullable<Plan["schedule"]["groups"]>[number];
export function actionableRequirements(plan: Plan) {
  const programs = new Set(planningPrograms(plan).map((p) => p.id));
  return plan.requirements.filter(
    (r) =>
      programs.has(r.programId) &&
      !plan.requirements.some((child) => child.parentId === r.id) &&
      (requirementCodes(r).length ||
        requirementSearch(r.title ?? "") ||
        r.minimumCourses ||
        r.minimumCredits) &&
      !/GPA|residency|total degree hours|unmatched/i.test(r.title ?? ""),
  );
}
export function requirementCoverage(plan: Plan, requirementId: string) {
  const rule = plan.requirements.find((r) => r.id === requirementId);
  const group = plan.schedule.groups?.find(
    (g) => g.requirementId === requirementId,
  );
  const ids = new Set([
    ...plan.allocations
      .filter((a) => a.requirementId === requirementId && a.confirmed)
      .map((a) => a.courseId),
    ...(group?.courseIds ?? []),
  ]);
  const courses = [
    ...new Map(
      plan.semesters
        .flatMap((s) => s.courses)
        .filter(
          (c) =>
            c.id &&
            ids.has(c.id) &&
            c.kind === "course" &&
            c.subject &&
            c.number &&
            ["completed", "in-progress", "planned"].includes(c.status),
        )
        .map((c) => [`${c.subject} ${c.number}`, c]),
    ).values(),
  ];
  const credits = courses.reduce(
    (sum, c) => sum + (group?.credits?.[c.id!] ?? c.credits ?? 0),
    0,
  );
  const count = rule?.minimumCourses ?? (rule?.minimumCredits ? 0 : 1);
  return {
    count: courses.length,
    credits,
    minimumCourses: count,
    minimumCredits: rule?.minimumCredits ?? 0,
    fulfilled:
      rule?.reportedStatus === "completed" ||
      (courses.length >= count && credits >= (rule?.minimumCredits ?? 0)),
    courses,
  };
}
export function reserveRequirement(
  plan: Plan,
  requirementId: string,
  term: string | null,
  id: () => string,
) {
  const rule = plan.requirements.find((r) => r.id === requirementId);
  if (!rule) throw Error("Missing requirement");
  const groups = [...(plan.schedule.groups ?? [])];
  const existing = groups.find((g) => g.requirementId === requirementId);
  if (existing) groups[groups.indexOf(existing)] = { ...existing, term };
  else
    groups.push({
      id: id(),
      kind: "requirement",
      requirementId,
      title: rule.title,
      term,
      courseIds: [],
    });
  return planSchema.parse({ ...plan, schedule: { ...plan.schedule, groups } });
}
export function assignRequirement(
  plan: Plan,
  requirementId: string,
  code: { subject: string; number: string },
  term: string,
  credits: number | null,
  id: () => string,
) {
  const next = reserveRequirement(
    addPlanningCourse(plan, code, term, id),
    requirementId,
    term,
    id,
  );
  const course = next.semesters
    .flatMap((s) => s.courses)
    .find(
      (c) =>
        c.subject === code.subject &&
        c.number === code.number &&
        c.kind === "course" &&
        c.status === "planned",
    );
  if (!course?.id) throw Error("Missing course");
  next.schedule.groups = next.schedule.groups!.map((g) =>
    g.requirementId === requirementId
      ? {
          ...g,
          courseIds: [...new Set([...g.courseIds, course.id!])],
          credits: {
            ...g.credits,
            ...(credits === null ? {} : { [course.id!]: credits }),
          },
        }
      : g,
  );
  next.allocations = next.allocations.filter(
    (a) => !(a.courseId === course.id && a.requirementId === requirementId),
  );
  next.allocations.push({
    courseId: course.id,
    requirementId,
    confirmed: true,
  });
  return planSchema.parse(next);
}
export function createAlternativeGroup(
  plan: Plan,
  courseIds: string[],
  term: string,
  id: () => string,
) {
  const eligible = new Set(
    plan.semesters
      .flatMap((s) => s.courses)
      .filter((c) => c.id && c.kind === "course" && c.status === "planned")
      .map((c) => c.id),
  );
  const used = new Set(
    (plan.schedule.groups ?? []).flatMap((g) => g.courseIds),
  );
  const unique = [...new Set(courseIds)];
  if (
    unique.length < 2 ||
    unique.some((id) => !eligible.has(id) || used.has(id))
  )
    throw Error("Select at least two ungrouped planned courses");
  return planSchema.parse({
    ...plan,
    schedule: {
      ...plan.schedule,
      groups: [
        ...(plan.schedule.groups ?? []),
        {
          id: id(),
          kind: "alternatives",
          term,
          courseIds: unique,
          selectedCourseId: null,
        },
      ],
    },
  });
}

export function moveCourseGroup(plan: Plan, id: string, term: string | null) {
  const group = plan.schedule.groups?.find((g) => g.id === id);
  if (!group) return plan;
  let next = plan;
  for (const courseId of group.courseIds) {
    const course = next.semesters
      .flatMap((s) => s.courses)
      .find((c) => c.id === courseId);
    if (course?.status === "planned") next = placeCourse(next, courseId, term);
  }
  return {
    ...next,
    schedule: {
      ...next.schedule,
      groups: next.schedule.groups?.map((g) =>
        g.id === id ? { ...g, term } : g,
      ),
    },
  };
}

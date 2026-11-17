import { planSchema, type Plan, type PlanCourse } from "./model.ts";
import { scheduledTerm, placeCourse, termOrder } from "./schedule.ts";

export function semesterLabel(term: string, locale: "en" | "zh") {
  if (term === "unassigned") return locale === "zh" ? "待安排" : "To arrange";
  if (term === "credit")
    return locale === "zh" ? "转学与考试学分" : "Transfer & exam credit";
  const match = term
    .replace(/ /g, "")
    .match(/^(Autumn|Spring|Summer)(20\d{2})$/);
  if (!match) return term;
  const season = { Autumn: "秋季", Spring: "春季", Summer: "夏季" };
  return locale === "zh"
    ? `${match[2]} ${season[match[1] as keyof typeof season]}`
    : `${match[1]} ${match[2]}`;
}

export function currentSemester(date = new Date()) {
  const month = date.getMonth();
  const season = month < 4 ? "Spring" : month < 8 ? "Summer" : "Autumn";
  return season + date.getFullYear();
}

export function nextSemester(date = new Date()) {
  const year = date.getFullYear(),
    month = date.getMonth();
  return month < 4
    ? `Summer${year}`
    : month < 8
      ? `Autumn${year}`
      : `Spring${year + 1}`;
}

export function boardCourses(plan: Plan) {
  const documents = new Map(plan.documents.map((d) => [d.id, d]));
  const rows = plan.semesters.flatMap((semester) =>
    semester.courses
      .filter((course) => course.evidenceRole !== "option")
      .map((course) => ({
        course,
        semester,
        source: documents.get(course.documentId ?? semester.documentId ?? ""),
        term: ["transfer", "exam"].includes(semester.creditOrigin ?? "")
          ? "credit"
          : ((course.id
              ? scheduledTerm(plan, course.id, semester.term)
              : (semester.term ?? course.term ?? null)
            )?.replace(/ /g, "") ?? "unassigned"),
      })),
  );
  // Audits repeat transcript facts under requirements. The semester document supplies placement.
  const placedCodes = new Set(
    rows
      .filter(
        (r) =>
          r.source?.source === "student-plan" || r.source?.source === "manual",
      )
      .filter((r) => r.course.subject && r.course.number)
      .map((r) => `${r.course.subject} ${r.course.number}`),
  );
  const protectedCodes = new Set(
    rows
      .filter((r) => r.course.subject && r.course.number)
      .filter(
        (r) =>
          r.course.status === "completed" ||
          r.course.status === "in-progress" ||
          r.term === "credit",
      )
      .map((r) => `${r.course.subject} ${r.course.number}`),
  );
  const resolved = new Map<string, PlanCourse["status"]>();
  const rank = { unknown: 0, withdrawn: 0, dropped: 0, failed: 0, planned: 1, "in-progress": 2, completed: 3 };
  for (const row of rows) {
    const key = `${row.course.subject} ${row.course.number}`;
    const status = row.term === "credit" ? "completed" : row.course.status;
    if (
      row.course.subject &&
      rank[status] > rank[resolved.get(key) ?? "unknown"]
    )
      resolved.set(key, status);
  }
  const seen = new Set<string>();
  const alternatives=(plan.schedule.groups ?? []).filter((g)=>g.kind==="alternatives");
  return rows
    .filter((r)=>!alternatives.some((g)=>r.course.id&&g.courseIds.includes(r.course.id)&&g.selectedCourseId!==r.course.id))
    .map((r)=>{const group=alternatives.find((g)=>g.selectedCourseId===r.course.id);return group?{...r,term:group.term?.replace(/ /g,"") ?? "unassigned"}:r;})
    .filter(
      (r) =>
        r.source?.source === "student-plan" ||
        r.source?.source === "manual" ||
        ((!placedCodes.has(`${r.course.subject} ${r.course.number}`) || ["withdrawn", "dropped", "failed"].includes(r.course.status)) &&
          r.course.kind === "course" &&
          (r.term !== "unassigned" || !placedCodes.size)),
    )
    .filter((r) => {
      const key =
        r.course.kind === "placeholder"
          ? `${r.course.title}|${r.term}`
          : `${r.course.subject} ${r.course.number}${["withdrawn", "dropped", "failed"].includes(r.course.status) ? "|" + r.term + "|" + r.course.status : ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({
      ...row,
      course: {
        ...row.course,
        status:
          ["withdrawn", "dropped", "failed"].includes(row.course.status) ? row.course.status : resolved.get(`${row.course.subject} ${row.course.number}`) ?? row.course.status,
      },
      protectedRecord: protectedCodes.has(
        `${row.course.subject} ${row.course.number}`,
      ),
    }));
}

export type BoardCourse = ReturnType<typeof boardCourses>[number];

export function addPlanningCourse(
  plan: Plan,
  code: { subject: string; number: string },
  term: string | null,
  id: () => string,
) {
  const existing = boardCourses({...plan,schedule:{...plan.schedule,groups:plan.schedule.groups?.filter((g)=>g.kind!=="alternatives")}}).find(
    (r) =>
      !["withdrawn", "dropped", "failed"].includes(r.course.status) &&
      r.course.kind === "course" &&
      r.course.subject === code.subject &&
      r.course.number === code.number,
  );
  if (existing) {
    if (
      existing.protectedRecord ||
      existing.course.status === "completed" ||
      existing.course.status === "in-progress" ||
      existing.term === "credit"
    )
      throw Error("Course already completed or in progress");
    if (existing.course.id) {
      const next=placeCourse(plan,existing.course.id,term);
      next.schedule.groups=next.schedule.groups?.map((g)=>g.kind==="alternatives"&&g.courseIds.includes(existing.course.id!)?{...g,selectedCourseId:existing.course.id,term}:g);
      return next;
    }
  }
  const document = plan.documents.find((d) => d.source === "manual") ?? {
    id: id(),
    source: "manual" as const,
    pdfOrigin: "export" as const,
    auditMode: "unknown" as const,
    catalogTerm: null,
  };
  const course: PlanCourse = {
    ...code,
    id: id(),
    documentId: document.id,
    kind: "course",
    evidenceRole: "observation",
    credits: null,
    status: "planned",
    repeated: boardCourses(plan).some((r) => r.course.subject === code.subject && r.course.number === code.number && ["withdrawn", "dropped", "failed"].includes(r.course.status)) || undefined,
    page: null,
  };
  const group = plan.semesters.findIndex(
    (s) =>
      s.documentId === document.id && s.term === term && s.courses.length < 100,
  );
  return planSchema.parse({
    ...plan,
    reviewed: false,
    documents: plan.documents.some((d) => d.id === document.id)
      ? plan.documents
      : [...plan.documents, document],
    semesters:
      group >= 0
        ? plan.semesters.map((s, i) =>
            i === group ? { ...s, courses: [...s.courses, course] } : s,
          )
        : [
            ...plan.semesters,
            {
              documentId: document.id,
              term,
              reportedCredits: null,
              creditOrigin: "unknown",
              courses: [course],
            },
          ],
    schedule: {
      ...plan.schedule,
      terms: [
        ...new Set([...plan.schedule.terms, ...(term ? [term] : [])]),
      ].sort(termOrder),
    },
  });
}

export const planningCampuses = [
  ["COL", "Columbus"], ["MNS", "Mansfield"], ["LMA", "Lima"],
  ["MRN", "Marion"], ["NWK", "Newark"], ["WST", "Wooster"],
] as const;

export function semesterCampus(plan: Plan, term: string) {
  return plan.schedule.campuses?.[term] ?? plan.semesters.find((s) => s.term?.replace(/ /g, "") === term && s.campus)?.campus ?? "COL";
}

export function removeEmptySemester(plan: Plan, term: string) {
  if (boardCourses(plan).some((row) => row.term === term) || plan.schedule.groups?.some((g)=>g.term?.replace(/ /g, "")===term)) return plan;
  const campuses = { ...plan.schedule.campuses };
  delete campuses[term];
  const sectionChoices={...plan.schedule.sectionChoices};
  const simulationPreferences={...plan.schedule.simulationPreferences};
  delete sectionChoices[term];
  delete simulationPreferences[term];
  return planSchema.parse({ ...plan, schedule: { ...plan.schedule,
    terms: plan.schedule.terms.filter((value) => value !== term), campuses, sectionChoices, simulationPreferences },
    semesters: plan.semesters.filter((s) => s.term?.replace(/ /g, "") !== term || s.courses.length > 0) });
}

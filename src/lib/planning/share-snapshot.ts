import { z } from "zod";
import { emptyPlan, type Plan } from "./model.ts";
import { boardCourses, semesterCampus } from "./workspace.ts";
import { termOrder } from "./schedule.ts";
import { createScenario } from "./scenarios.ts";

const term = z.string().regex(/^(?:Autumn|Spring|Summer)20\d{2}$/);
export const planShareSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(60),
    semesters: z
      .array(
        z
          .object({
            term,
            campus: z.enum(["COL", "MNS", "LMA", "MRN", "NWK", "WST"]),
            placeholders: z
              .array(
                z
                  .object({
                    title: z.string().trim().min(1).max(400),
                    credits: z.number().min(0).max(99).nullable(),
                  })
                  .strip(),
              )
              .max(100)
              .optional(),
            courses: z
              .array(
                z
                  .object({
                    subject: z.string().regex(/^[A-Z][A-Z& ]{1,11}$/),
                    number: z.string().regex(/^\d{4}(?:\.\d{1,2})?[A-Z]?$/),
                    title: z.string().max(400).optional(),
                    credits: z.number().min(0).max(99).nullable(),
                    section: z
                      .string()
                      .regex(/^[A-Z0-9]{1,8}$/)
                      .optional(),
                    sections: z
                      .array(z.string().regex(/^[a-zA-Z0-9-]{1,80}$/))
                      .max(12)
                      .optional(),
                  })
                  .strip(),
              )
              .max(100),
          })
          .strip(),
      )
      .min(1)
      .max(24),
  })
  .strip()
  .superRefine((value, ctx) => {
    const courses = value.semesters.flatMap((s) =>
      s.courses.map((c) => `${s.term}|${c.subject} ${c.number}`),
    );
    if (
      new Set(courses).size !== courses.length ||
      value.semesters.some(
        (s) => s.courses.length + (s.placeholders?.length ?? 0) > 100,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate course or semester capacity exceeded",
      });
    if (
      new Set(value.semesters.map((s) => s.term)).size !==
      value.semesters.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate semester" });
  });
export type PlanShare = z.infer<typeof planShareSchema>;
/** Explicit allowlist: academic records and private workspace fields cannot escape. */
export function planShareSnapshot(
  plan: Plan,
  title: string,
  terms: string[],
): PlanShare {
  const rows = boardCourses(plan);
  return planShareSchema.parse({
    version: 1,
    title,
    semesters: [...new Set(terms)].sort(termOrder).map((term) => ({
      term,
      campus: semesterCampus(plan, term),
      placeholders: rows
        .filter((r) => r.term === term && r.course.kind === "placeholder")
        .map(({ course }) => ({
          title: course.title || "Elective",
          credits: course.credits,
        })),
      courses: rows
        .filter(
          (r) =>
            r.term === term &&
            r.course.kind === "course" &&
            r.course.subject &&
            r.course.number,
        )
        .map(({ course: c }) => ({
          subject: c.subject,
          number: c.number,
          title: c.title,
          credits: c.credits,
          section: c.section,
          sections:
            plan.schedule.sectionChoices?.[term]?.[`${c.subject} ${c.number}`],
        })),
    })),
  });
}
export function copyPlanShare(
  workspace: Plan,
  input: unknown,
  scenarioId: string,
  id: () => string,
): Plan {
  const snapshot = planShareSchema.parse(input),
    next = emptyPlan(),
    documentId = id();
  next.documents = [
    {
      id: documentId,
      source: "manual",
      pdfOrigin: "export",
      auditMode: "unknown",
      catalogTerm: null,
    },
  ];
  const counts = new Map<string, number>();
  for (const semester of snapshot.semesters)
    for (const c of semester.courses) {
      const key = c.subject + " " + c.number;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  for (const semester of snapshot.semesters) {
    next.schedule.terms.push(semester.term);
    next.schedule.campuses = {
      ...next.schedule.campuses,
      [semester.term]: semester.campus,
    };
    const courses: Plan["semesters"][number]["courses"] = semester.courses.map(
      (course) => {
        if (course.sections?.length)
          next.schedule.sectionChoices = {
            ...next.schedule.sectionChoices,
            [semester.term]: {
              ...next.schedule.sectionChoices?.[semester.term],
              [course.subject + " " + course.number]: course.sections,
            },
          };
        return {
          id: id(),
          documentId,
          kind: "course",
          subject: course.subject,
          number: course.number,
          title: course.title,
          credits: course.credits,
          section: course.section,
          status: "planned",
          evidenceRole: "observation",
          repeated:
            (counts.get(course.subject + " " + course.number) ?? 0) > 1 ||
            undefined,
          page: null,
        };
      },
    );
    for (const slot of semester.placeholders ?? [])
      courses.push({
        ...slot,
        id: id(),
        documentId,
        subject: null,
        number: null,
        kind: "placeholder",
        evidenceRole: "unknown",
        status: "planned",
        page: null,
      });
    next.semesters.push({
      documentId,
      term: semester.term,
      reportedCredits: null,
      courses,
    });
  }
  return createScenario(workspace, snapshot.title, scenarioId, next);
}

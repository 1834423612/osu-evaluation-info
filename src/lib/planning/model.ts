import { z } from "zod";

// Deliberately no names, IDs, filenames, raw text, arbitrary notes or URLs.
const term = z
  .string()
  .regex(/^(?:Autumn|Spring|Summer) ?20\d{2}$/)
  .nullable();
const credits = z.number().min(0).max(99).nullable();
const reference = z.string().regex(/^[a-z0-9-]{1,80}$/);
const appliedVersion = z
  .string()
  .regex(/^(?:AU|SP|SU)20\d{2}$/)
  .nullable();
const source = z.enum([
  "student-plan",
  "standard-audit",
  "expanded-audit",
  "compact-audit",
  "manual",
]);
const auditMode = z.enum(["official", "planned", "unknown"]);
const pdfOrigin = z.enum(["export", "browser-print"]);
const programSchema = z
  .object({
    id: reference,
    documentId: reference,
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9-]{0,39}$/)
      .nullable(),
    declaration: z.enum(["declared", "undeclared", "unknown"]),
    appliedVersion,
    catalogTerm: term,
    remainingCredits: z.number().min(0).max(999).nullable(),
  })
  .strip();
const requirementSchema = z
  .object({
    id: reference,
    documentId: reference,
    programId: reference,
    parentId: reference.nullable(),
    hierarchyReviewed: z.boolean().optional(),
    category: z
      .enum([
        "general",
        "launch",
        "writing",
        "math",
        "arts",
        "history",
        "science",
        "social",
        "diversity",
        "citizenship",
        "reflection",
        "core",
        "electives",
        "survey",
      ])
      .optional(),
    kind: z.enum(["all", "any", "credits", "courses", "unknown"]),
    minimumCredits: z.number().min(0).max(999).nullable(),
    minimumCourses: z.number().int().min(0).max(100).nullable(),
    alternatives: z
      .array(
        z
          .object({
            subject: z.string().regex(/^[A-Z][A-Z& ]{1,11}$/),
            number: z.string().regex(/^\d{4}(?:\.\d{1,2})?[A-Z]?$/),
          })
          .strip(),
      )
      .max(100),
    page: z.number().int().min(1).max(200).nullable(),
  })
  .strip();
export const courseSchema = z
  .object({
    id: reference.optional(),
    documentId: reference.optional(),
    subject: z
      .string()
      .regex(/^[A-Z][A-Z& ]{1,11}$/)
      .nullable(),
    number: z
      .string()
      .regex(/^\d{4}(?:\.\d{1,2})?[A-Z]?$/)
      .nullable(),
    kind: z.enum(["course", "placeholder"]),
    evidenceRole: z.enum(["observation", "option", "unknown"]).optional(),
    credits,
    status: z.enum(["planned", "completed", "in-progress", "unknown"]),
    page: z.number().int().min(1).max(200).nullable(),
  })
  .strip();
const planObject = z
  .object({
    schemaVersion: z.literal(2),
    documents: z
      .array(
        z
          .object({
            id: reference,
            source,
            pdfOrigin,
            auditMode,
            catalogTerm: term,
          })
          .strip(),
      )
      .max(20)
      .default([]),
    programs: z.array(programSchema).max(100).default([]),
    requirements: z.array(requirementSchema).max(1000).default([]),
    allocations: z
      .array(
        z
          .object({
            courseId: reference,
            requirementId: reference,
            confirmed: z.boolean(),
          })
          .strip(),
      )
      .max(2000)
      .default([]),
    pdfOrigin: z.enum(["export", "browser-print"]).default("export"),
    source: z.enum([
      "student-plan",
      "standard-audit",
      "expanded-audit",
      "compact-audit",
      "manual",
    ]),
    auditMode: z.enum(["official", "planned", "unknown"]),
    appliedVersion: z
      .string()
      .regex(/^(?:AU|SP|SU)20\d{2}$/)
      .nullable(),
    catalogTerm: term,
    semesters: z
      .array(
        z
          .object({
            documentId: reference.optional(),
            term,
            creditOrigin: z
              .enum(["institutional", "transfer", "exam", "unknown"])
              .optional(),
            reportedCredits: credits,
            courses: z.array(courseSchema).max(100),
          })
          .strip(),
      )
      .max(40),
    reviewed: z.boolean(),
  })
  .strip();
export const planSchema = z
  .preprocess((value) => {
    if (
      value &&
      typeof value === "object" &&
      "schemaVersion" in value &&
      value.schemaVersion === 1
    )
      return { ...value, schemaVersion: 2 };
    return value;
  }, planObject)
  .superRefine((plan, ctx) => {
    const documents = new Set(plan.documents.map((d) => d.id));
    const programs = new Map(plan.programs.map((p) => [p.id, p]));
    const requirements = new Map(plan.requirements.map((r) => [r.id, r]));
    const courses = plan.semesters
      .flatMap((s) => s.courses)
      .filter((c) => c.id);
    const courseIds = new Set(courses.map((c) => c.id));
    const issue = () =>
      ctx.addIssue({
        code: "custom",
        message: "Invalid or duplicate planning reference",
      });
    if (
      documents.size !== plan.documents.length ||
      programs.size !== plan.programs.length ||
      requirements.size !== plan.requirements.length ||
      courseIds.size !== courses.length
    )
      issue();
    for (const p of plan.programs) if (!documents.has(p.documentId)) issue();
    for (const s of plan.semesters) {
      if (
        s.term &&
        (s.creditOrigin === "transfer" || s.creditOrigin === "exam")
      )
        issue();
      if (s.documentId && !documents.has(s.documentId)) issue();
      for (const c of s.courses)
        if (c.documentId && !documents.has(c.documentId)) issue();
    }
    for (const r of plan.requirements) {
      if (
        !documents.has(r.documentId) ||
        programs.get(r.programId)?.documentId !== r.documentId
      )
        issue();
      const seen = new Set([r.id]);
      let parent = r.parentId;
      while (parent) {
        const node = requirements.get(parent);
        if (!node || seen.has(parent) || node.programId !== r.programId) {
          issue();
          break;
        }
        seen.add(parent);
        parent = node.parentId;
      }
    }
    for (const a of plan.allocations)
      if (!courseIds.has(a.courseId) || !requirements.has(a.requirementId))
        issue();
  });
export type Plan = z.infer<typeof planSchema>;
export type PlanCourse = z.infer<typeof courseSchema>;
export function emptyPlan(): Plan {
  return {
    schemaVersion: 2,
    documents: [],
    programs: [],
    requirements: [],
    allocations: [],
    pdfOrigin: "export",
    source: "manual",
    auditMode: "unknown",
    appliedVersion: null,
    catalogTerm: null,
    semesters: [],
    reviewed: false,
  };
}
export function serializePlan(input: unknown): string {
  const plan = planSchema.parse(input);
  if (!plan.reviewed) throw Error("Review required");
  return JSON.stringify(plan, null, 2);
}
export const PLAN_STORAGE_KEY = "course-atlas:private-planning:v1";
export function savePlan(storage: Pick<Storage, "setItem">, input: unknown) {
  storage.setItem(PLAN_STORAGE_KEY, serializePlan(input));
}
export function loadPlan(storage: Pick<Storage, "getItem">): Plan | null {
  const raw = storage.getItem(PLAN_STORAGE_KEY);
  return raw ? planSchema.parse(JSON.parse(raw)) : null;
}
export function courseSearchHref(course: PlanCourse): string | null {
  const value = courseSchema.parse(course);
  if (value.kind !== "course" || !value.subject || !value.number) return null;
  return "/?" + new URLSearchParams({ q: `${value.subject} ${value.number}` });
}

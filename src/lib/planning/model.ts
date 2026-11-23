import { z } from "zod";
import { academicTitle } from "./academic-text.ts";
import { calendarSchema } from "../calendar/model.ts";
const title = z.string().max(400).transform(academicTitle).optional();

// Academic labels only; no identity fields, filenames, raw documents, notes or URLs.
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
    title,
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
    title,
    reportedStatus: z
      .enum(["completed", "in-progress", "planned", "remaining"])
      .optional(),
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
            evidenceRole: z
              .enum(["observation", "option", "unknown"])
              .optional(),
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
    title,
    term: term.optional(),
    section: z
      .string()
      .regex(/^[A-Z0-9]{1,8}$/)
      .optional(),
    session: z.enum(["1", "2"]).optional(),
    kind: z.enum(["course", "placeholder"]),
    evidenceRole: z.enum(["observation", "option", "unknown"]).optional(),
    credits,
    status: z.enum([
      "planned",
      "completed",
      "in-progress",
      "unknown",
      "withdrawn",
      "dropped",
      "failed",
    ]),
    userStatus: z
      .enum(["registered", "dropped-no-w", "withdrawn-w"])
      .optional(),
    repeated: z.boolean().optional(),
    page: z.number().int().min(1).max(200).nullable(),
  })
  .strip();
const planObject = z
  .object({
    schemaVersion: z.literal(3),
    schedule: z
      .object({
        calendars: z.array(calendarSchema).max(40).optional(),
        groups: z
          .array(
            z
              .object({
                id: reference,
                kind: z.enum(["requirement", "alternatives"]),
                requirementId: reference.optional(),
                title,
                term,
                courseIds: z.array(reference).max(100),
                selectedCourseId: reference.nullable().optional(),
                credits: z
                  .record(reference, z.number().min(0).max(99))
                  .optional(),
              })
              .strip(),
          )
          .max(200)
          .optional(),
        sectionChoices: z
          .record(
            z.string().regex(/^(?:Autumn|Spring|Summer)20\d{2}$/),
            z.record(
              z.string().max(30),
              z.array(z.string().regex(/^[a-zA-Z0-9-]{1,80}$/)).max(12),
            ),
          )
          .optional(),
        simulationPreferences: z
          .record(
            z.string().regex(/^(?:Autumn|Spring|Summer)20\d{2}$/),
            z.object({
              compact: z.boolean(),
              buffer: z.number().int().min(0).max(120),
              blocked: z
                .array(
                  z
                    .object({
                      days: z
                        .array(z.number().int().min(0).max(6))
                        .min(1)
                        .max(7),
                      start: z.number().int().min(0).max(1439),
                      end: z.number().int().min(1).max(1440),
                    })
                    .refine((b) => b.start < b.end),
                )
                .max(30),
            }),
          )
          .optional(),
        campuses: z
          .record(
            z.string().regex(/^(?:Autumn|Spring|Summer)20\d{2}$/),
            z.enum(["COL", "MNS", "LMA", "MRN", "NWK", "WST"]),
          )
          .optional(),
        terms: z
          .array(z.string().regex(/^(?:Autumn|Spring|Summer)20\d{2}$/))
          .max(24),
        placements: z
          .array(z.object({ courseId: reference, term }).strip())
          .max(1000),
      })
      .strip()
      .default({ terms: [], placements: [] }),
    hiddenPrograms: z
      .array(z.string().regex(/^[A-Z][A-Z0-9-]{0,39}$/))
      .max(100)
      .optional(),
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
            campus: z
              .enum(["COL", "MNS", "LMA", "MRN", "NWK", "WST"])
              .optional(),
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
function validatePlan(plan: z.infer<typeof planObject>, ctx: z.RefinementCtx) {
  const documents = new Set(plan.documents.map((d) => d.id));
  const programs = new Map(plan.programs.map((p) => [p.id, p]));
  const requirements = new Map(plan.requirements.map((r) => [r.id, r]));
  const courses = plan.semesters.flatMap((s) => s.courses).filter((c) => c.id);
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
  if (
    new Set(plan.schedule.terms).size !== plan.schedule.terms.length ||
    new Set(plan.schedule.placements.map((p) => p.courseId)).size !==
      plan.schedule.placements.length
  )
    issue();
  for (const p of plan.schedule.placements)
    if (
      !courseIds.has(p.courseId) ||
      (p.term && !plan.schedule.terms.includes(p.term.replace(/ /g, "")))
    )
      issue();
  const groupIds = new Set<string>();
  for (const group of plan.schedule.groups ?? []) {
    if (
      groupIds.has(group.id) ||
      group.courseIds.some((id) => !courseIds.has(id)) ||
      (group.requirementId && !requirements.has(group.requirementId)) ||
      (group.selectedCourseId &&
        !group.courseIds.includes(group.selectedCourseId))
    )
      issue();
    groupIds.add(group.id);
  }
  for (const p of plan.programs) if (!documents.has(p.documentId)) issue();
  for (const s of plan.semesters) {
    if (s.term && (s.creditOrigin === "transfer" || s.creditOrigin === "exam"))
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
}
function migrateVersion(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    (value.schemaVersion === 1 || value.schemaVersion === 2)
  )
    return { ...value, schemaVersion: 3 };
  return value;
}
// A scenario is a separate, bounded plan, never a recursive workspace tree.
const scenarioSchema = z
  .object({
    id: reference,
    title: z.string().trim().min(1).max(60),
    plan: z.preprocess(migrateVersion, planObject.superRefine(validatePlan)),
  })
  .strip();
export const planSchema = z
  .preprocess(
    migrateVersion,
    planObject.extend({
      scenarios: z.array(scenarioSchema).max(20).optional(),
    }),
  )
  .superRefine(validatePlan)
  .superRefine((plan, ctx) => {
    if (
      new Set(plan.scenarios?.map((scenario) => scenario.id)).size !==
      (plan.scenarios?.length ?? 0)
    )
      ctx.addIssue({ code: "custom", message: "Duplicate independent plan" });
  });
export type Plan = z.infer<typeof planSchema>;
// Old clients strip fields they do not know. Only the current format may replace
// a cloud workspace; reading/importing older backups remains supported.
export const planUploadSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("schemaVersion" in value) ||
      value.schemaVersion !== 3
    )
      ctx.addIssue({
        code: "custom",
        message: "Refresh to the current planning format before syncing",
      });
  })
  .pipe(planSchema);
export type PlanCourse = z.infer<typeof courseSchema>;
export function emptyPlan(): Plan {
  return {
    schemaVersion: 3,
    schedule: { terms: [], placements: [] },
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

import { z } from "zod";

// Deliberately no names, IDs, filenames, raw text, arbitrary notes or URLs.
const term = z
  .string()
  .regex(/^(?:Autumn|Spring|Summer) ?20\d{2}$/)
  .nullable();
const credits = z.number().min(0).max(99).nullable();
export const courseSchema = z
  .object({
    subject: z
      .string()
      .regex(/^[A-Z][A-Z& ]{1,11}$/)
      .nullable(),
    number: z
      .string()
      .regex(/^\d{4}(?:\.\d{1,2})?[A-Z]?$/)
      .nullable(),
    kind: z.enum(["course", "placeholder"]),
    credits,
    status: z.enum(["planned", "completed", "in-progress", "unknown"]),
    page: z.number().int().min(1).max(200).nullable(),
  })
  .strip();
export const planSchema = z
  .object({
    schemaVersion: z.literal(1),
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
export type Plan = z.infer<typeof planSchema>;
export type PlanCourse = z.infer<typeof courseSchema>;
export function emptyPlan(): Plan {
  return {
    schemaVersion: 1,
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

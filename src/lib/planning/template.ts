import { z } from "zod";
import type { Plan } from "./model.ts";
const code = z.string().regex(/^[A-Z][A-Z0-9-]{1,39}$/);
export const templateSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateType: z.literal("program-requirements"),
    programCode: code,
    appliedVersion: z.string().regex(/^(AU|SP|SU)20\d{2}$/),
    basis: z.literal("user-reviewed"),
    rules: z
      .array(
        z
          .object({
            id: z.string().regex(/^rule-[1-9]\d{0,3}$/),
            parentId: z
              .string()
              .regex(/^rule-[1-9]\d{0,3}$/)
              .nullable(),
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
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict()
  .superRefine((template, ctx) => {
    const nodes = new Map(template.rules.map((r) => [r.id, r]));
    if (nodes.size !== template.rules.length)
      ctx.addIssue({ code: "custom", message: "Duplicate rule" });
    for (const rule of template.rules) {
      const seen = new Set([rule.id]);
      let parent = rule.parentId;
      while (parent) {
        if (seen.has(parent) || !nodes.has(parent)) {
          ctx.addIssue({ code: "custom", message: "Invalid rule tree" });
          break;
        }
        seen.add(parent);
        parent = nodes.get(parent)!.parentId;
      }
    }
  });
/** Deliberately omits personal course selections, allocations, semesters and source identities. */
export function programTemplate(plan: Plan, programId: string) {
  const program = plan.programs.find((p) => p.id === programId);
  const rules = plan.requirements.filter((r) => r.programId === programId);
  if (
    !plan.reviewed ||
    !program?.code ||
    !program.appliedVersion ||
    !rules.length ||
    rules.some((r) => !r.hierarchyReviewed)
  )
    throw Error("Review program, version and every rule first");
  const ids = new Map(rules.map((r, i) => [r.id, "rule-" + (i + 1)]));
  return templateSchema.parse({
    schemaVersion: 1,
    templateType: "program-requirements",
    programCode: program.code,
    appliedVersion: program.appliedVersion,
    basis: "user-reviewed",
    rules: rules.map((r) => ({
      id: ids.get(r.id),
      parentId: r.parentId ? ids.get(r.parentId) : null,
      kind: r.kind,
      minimumCredits: r.minimumCredits,
      minimumCourses: r.minimumCourses,
      alternatives: r.alternatives.map((c) => ({
        subject: c.subject,
        number: c.number,
      })),
    })),
  });
}

import { z } from "zod";
export const adminFiltersSchema = z.object({
  course: z.string().trim().max(80).default(""),
  professor: z.string().trim().max(120).default(""),
  keyword: z.string().trim().max(200).default(""),
  status: z
    .enum([
      "all",
      "accepted",
      "ambiguous",
      "unresolved",
      "stale",
      "bound",
      "unbound",
      "rejected",
    ])
    .default("all"),
  campus: z
    .enum(["ALL", "COL", "MNS", "LMA", "MRN", "NWK", "WST"])
    .default("ALL"),
  page: z.coerce.number().int().min(1).max(3334).default(1),
});
export const adminDetailSchema = z.object({
  professorId: z.string().regex(/^[1-9]\d{0,17}$/),
  campus: z.enum(["COL", "MNS", "LMA", "MRN", "NWK", "WST"]),
  token: z
    .string()
    .max(120)
    .regex(/^[A-Z0-9.]*$/),
});
export const courseDecisionInput = adminDetailSchema
  .extend({
    action: z.enum(["bind", "unbind", "reject"]),
    courseKey: z
      .string()
      .regex(/^[A-Z]{2,20}\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/)
      .nullable(),
    expectedVersion: z.number().int().min(0).max(2147483646),
    reason: z.string().trim().min(3).max(2000),
    evidenceUrls: z
      .array(
        z
          .url()
          .max(2000)
          .refine((url) => {
            try {
              const parsed = new URL(url);
              return (
                parsed.protocol === "https:" &&
                !parsed.username &&
                !parsed.password
              );
            } catch {
              return false;
            }
          }, "Evidence links must use HTTPS without credentials"),
      )
      .max(12),
  })
  .refine((input) => (input.action === "bind") === (input.courseKey !== null));
export type CourseDecisionInput = z.infer<typeof courseDecisionInput>;
export const batchDecisionItem = courseDecisionInput.safeExtend({
  recordFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const courseDecisionBatchInput = z
  .object({
    items: z.array(batchDecisionItem).min(1).max(100),
    confirmed: z.literal(true),
    proposalId: z.uuid().optional(),
    proposalSnapshot: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!!value.proposalId !== !!value.proposalSnapshot)
      ctx.addIssue({
        code: "custom",
        path: ["proposalId"],
        message: "A proposal requires its immutable snapshot hash",
      });
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      const key = JSON.stringify([item.professorId, item.campus, item.token]);
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["items", index],
          message: "Duplicate course group",
        });
      seen.add(key);
    });
  });
export type BatchDecisionInput = z.infer<typeof courseDecisionBatchInput>;
export type BatchDecisionItem = z.infer<typeof batchDecisionItem>;
export type AdminFilters = z.infer<typeof adminFiltersSchema>;

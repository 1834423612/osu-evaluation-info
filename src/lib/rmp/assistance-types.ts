import { z } from "zod";
import { adminDetailSchema, courseDecisionInput } from "./admin-input.ts";
export const safeEvidenceUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !!url.hostname
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS URL without credentials");
export const assistanceGroupSchema = adminDetailSchema
  .extend({
    name: z.string().max(300),
    department: z.string().max(300),
    username: z.string().max(100).nullable(),
    decisionVersion: z.number().int().min(0),
    recordFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    currentCourseKey: z.string().max(80).nullable(),
    reviewCount: z.number().int().nonnegative(),
    reviewsSampled: z.boolean(),
    candidates: z
      .array(
        z
          .object({
            key: z.string().max(80),
            title: z.string().max(500),
            source: z.enum([
              "official_catalog",
              "official_catalog_history",
              "official_evaluation",
            ]),
            term: z.string().max(40).nullable(),
          })
          .strict(),
      )
      .max(20),
    teaching: z
      .array(
        z
          .object({
            source: z.string().max(100),
            courseKey: z.string().max(80),
            term: z.string().max(40),
            campus: z.string().max(20),
          })
          .strict(),
      )
      .max(50),
    reviews: z
      .array(
        z
          .object({
            id: z.string().max(80),
            course: z.string().max(200),
            comment: z.string().max(2000),
            date: z.string().max(100).nullable(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();
export const assistanceProposalItem = courseDecisionInput
  .safeExtend({
    recordFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    confidence: z.number().min(0).max(1),
    evidenceUrls: z.array(safeEvidenceUrl).max(12),
  })
  .strict();
export const assistanceProposalInput = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.uuid(),
    snapshotFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sourceLabel: z.string().trim().min(1).max(100),
    items: z.array(assistanceProposalItem).min(1).max(100),
  })
  .strict();
export const assistanceCreateInput = z
  .object({
    action: z.literal("create"),
    groups: z.array(adminDetailSchema.strict()).min(1).max(100),
    remote: z.boolean().default(false),
    minutes: z.number().int().min(5).max(240).default(60),
  })
  .strict();
export const assistanceHumanInput = z.discriminatedUnion("action", [
  assistanceCreateInput,
  z
    .object({ action: z.literal("import"), proposal: assistanceProposalInput })
    .strict(),
  z.object({ action: z.literal("revoke"), jobId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal("reject"),
      proposalId: z.uuid(),
      groups: z.array(adminDetailSchema.strict()).min(1).max(100).optional(),
    })
    .strict(),
]);
export type AssistanceGroup = z.infer<typeof assistanceGroupSchema>;
export type AssistanceProposal = z.infer<typeof assistanceProposalInput>;
export const assistanceProposalJsonSchema = z.toJSONSchema(
  assistanceProposalInput,
  { unrepresentable: "any" },
);
export const assistanceKey = (item: {
  professorId: string;
  campus: string;
  token: string;
}) => `${item.professorId}:${item.campus}:${item.token}`;

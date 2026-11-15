import { z } from "zod";
const publicUrl = z
  .string()
  .url()
  .refine((value) => {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      (u.hostname === "osu.edu" || u.hostname.endsWith(".osu.edu")) &&
      !u.username &&
      !u.password &&
      !u.search &&
      (!u.port || u.port === "443")
    );
  });
const creditRange = z
  .object({ min: z.number().min(0).max(99), max: z.number().min(0).max(99) })
  .strict()
  .refine((r) => r.min <= r.max)
  .nullable();
export const curriculumSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]{1,100}$/),
    source: z
      .object({
        url: publicUrl,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        fetchedAt: z.string().datetime({ offset: true }),
        validatedAt: z.string().datetime({ offset: true }).nullable(),
        mediaType: z.enum(["text/html", "application/pdf"]),
      })
      .strict(),
    documentKind: z.enum(["sample-plan", "requirements"]),
    program: z.string().min(1).max(150),
    specialization: z.string().max(150).nullable(),
    campus: z.string().max(80).nullable(),
    geSystem: z.enum(["GEN", "GEL"]).nullable(),
    version: z.string().min(1).max(100),
    applicableFrom: z.string().max(40).nullable(),
    applicableUntil: z.string().max(40).nullable(),
    evidence: z.array(z.string().max(500)).min(1).max(100),
    semesters: z
      .array(
        z
          .object({
            label: z.string().max(80),
            credits: creditRange,
            entries: z
              .array(
                z
                  .object({
                    evidence: z.string().max(500),
                    credits: creditRange,
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .max(20),
    reviewStatus: z.enum(["pending", "approved", "rejected"]),
    reviewedAt: z.string().datetime({ offset: true }).nullable(),
    reviewer: z.string().min(1).max(100).nullable(),
  })
  .strict()
  .refine(
    (x) =>
      x.reviewStatus !== "approved" ||
      (x.reviewedAt !== null &&
        x.reviewer !== null &&
        x.source.validatedAt !== null),
    { message: "Approval requires dated human review and source validation" },
  );

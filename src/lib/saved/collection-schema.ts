import { z } from "zod";

export const favoriteKeySchema = z
  .string()
  .min(1)
  .max(320)
  .regex(/^(course|section|instructor|syllabus):[^\u0000-\u001f]+$/);
export const collectionSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(60),
    tags: z.array(z.string().trim().min(1).max(24)).max(12),
    members: z.array(favoriteKeySchema).max(700),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.members).size !== value.members.length ||
      new Set(value.tags).size !== value.tags.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate collection member or tag",
      });
  });
export const collectionsSchema = z
  .array(collectionSchema)
  .max(30)
  .superRefine((value, ctx) => {
    if (new Set(value.map((x) => x.id)).size !== value.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate collection identity",
      });
  });
export type SavedCollection = z.infer<typeof collectionSchema>;

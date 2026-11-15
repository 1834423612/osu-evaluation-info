import { z } from "zod";
import { collectionsSchema } from "./collection-schema.ts";
const records = z.object({
  "course-atlas:saved:v1": z.string().nullable(),
  "course-atlas:saved-sections:v1": z.string().nullable(),
  "course-atlas:saved-instructors:v1": z.string().nullable(),
  "course-atlas:saved-syllabi:v1": z.string().nullable(),
});
export const backupSchema = z.object({
  format: z.literal("waho-private-backup"),
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  workspace: z.union([
    z.object({ version: z.literal(1), records }),
    z.object({
      version: z.literal(2),
      records,
      collections: collectionsSchema,
    }),
  ]),
});
export type LocalBackup = z.infer<typeof backupSchema>;
export function parseLocalBackup(raw: string) {
  if (new TextEncoder().encode(raw).byteLength > 10485760)
    throw Error("backup_size");
  return backupSchema.parse(JSON.parse(raw));
}

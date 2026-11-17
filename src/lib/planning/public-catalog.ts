import { z } from "zod";
import { curriculumSchema, publicUrl } from "./curriculum.ts";
import { directorySchema } from "./directory.ts";
import { planningTable } from "./namespace.ts";

export const publicCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  directory: directorySchema,
  curricula: z.array(curriculumSchema).min(1).max(10000),
  subjects: z
    .array(z.object({ code: z.string().max(30), title: z.string().max(150) }))
    .max(1000),
  sources: z
    .array(
      z.object({
        url: publicUrl,
        college: z.string().max(150),
        comparison: z.string().max(2000).optional(),
        downloadUrl: publicUrl.optional(),
      }),
    )
    .max(10000),
});
export type PublicCatalog = z.infer<typeof publicCatalogSchema>;
export interface CatalogReader {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: { catalog: unknown }[] }>;
}
export async function readPublicCatalog(
  database: CatalogReader,
): Promise<PublicCatalog> {
  const result = await database.query(
    `SELECT catalog FROM ${planningTable("catalog_release")} ORDER BY published_at DESC, id DESC LIMIT 1`,
  );
  if (!result.rows.length)
    throw Error("Planning catalog has not been published");
  return publicCatalogSchema.parse(result.rows[0].catalog);
}

import { browserContextSchema } from "./context.ts";
import { z } from "zod";
import { safeSearchTerm } from "../analytics/privacy.ts";
import { normalizeCourseSearch } from "../analytics.ts";
export const eventTypes = [
  "page_view",
  "search",
  "search_result",
  "course_open",
  "favorite_add",
  "favorite_remove",
  "share_import",
] as const;
export const productEventSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(eventTypes),
    path: z.string().max(300),
    entity: z.string().max(320).optional(),
    term: z.string().max(2000).optional(),
    status: z
      .enum([
        "matches",
        "no_matches",
        "continuation",
        "filter_conflict",
        "error",
      ])
      .optional(),
    count: z.number().int().min(0).max(100000).optional(),
    duration: z.number().int().min(0).max(120000).optional(),
    capturedAt: z.iso.datetime(),
  })
  .transform((v) => ({
    ...v,
    path: telemetryPath(v.path),
    term: v.term
      ? safeSearchTerm(normalizeCourseSearch(v.term)?.searchTerm ?? v.term)
      : undefined,
  }));
export type ProductEvent = z.infer<typeof productEventSchema>;
export const telemetryBatchSchema = z.object({
  device: z.uuid(),
  session: z.uuid(),
  language: z.string().max(50),
  languages: z.array(z.string().max(50)).max(10),
  timeZone: z.string().max(100),
  viewport: z.enum(["small", "medium", "large"]),
  context: browserContextSchema.optional(),
  events: z.array(productEventSchema).min(1).max(20),
});
export function telemetryPath(raw: string) {
  try {
    const path = new URL(raw, "https://local.invalid").pathname;
    if (path.startsWith("/share")) return "/share";
    if (path.startsWith("/transfer")) return "/transfer";
    if (/^\/rmp\/\d+/.test(path)) return "/rmp/profile";
    return /^\/(?:$|saved|account|history|reference|methodology|updates|rmp|popular|diagnostics)\/?$/.test(
      path,
    )
      ? path
      : "/other";
  } catch {
    return "/other";
  }
}
export function stableFavoriteKey(key: string) {
  if (/^(?:course|section):[^\u0000-\u001f]{1,300}$/.test(key)) return key;
  const id = key.slice("instructor:".length);
  if (
    key.startsWith("instructor:") &&
    (/^(?:osu:)?[a-z][a-z0-9_-]*\.\d+$/i.test(id) || /^rmp:\d+$/.test(id))
  )
    return key;
  return null;
}

import { apiError, apiJson, apiNotFound } from "@/lib/api/http";
import { getRepository } from "@/lib/api/repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ key: string[] }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key: segments } = await context.params;
    // Catch-all routing keeps title-qualified unknown-catalog keys addressable
    // even when a source title contains a slash.
    const key = decodeURIComponent(segments.join("/"));
    const record = await getRepository().getCourse(key);
    return record ? apiJson(record) : apiNotFound("Course not found.");
  } catch (error) {
    return apiError(error);
  }
}

import { apiError, apiJson, apiNotFound } from "@/lib/api/http";
import { getRepository } from "@/lib/api/repository";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    const record = await getRepository().getInstructor(decodeURIComponent(key));
    return record ? apiJson(record) : apiNotFound("Instructor not found.");
  } catch (error) {
    return apiError(error);
  }
}

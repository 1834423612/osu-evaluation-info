import { apiError, apiJson } from "@/lib/api/http";
import { getRepository } from "@/lib/api/repository";
import { parseSearchRequest } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = parseSearchRequest(url.searchParams);
    return apiJson(await getRepository().search(filters));
  } catch (error) {
    return apiError(error);
  }
}

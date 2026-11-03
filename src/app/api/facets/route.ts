import { apiError, apiJson } from "@/lib/api/http";
import { getRepository } from "@/lib/api/repository";
import { parseSearchFilters } from "@/lib/api/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return apiJson(
      await getRepository().getFacets(parseSearchFilters(url.searchParams)),
    );
  } catch (error) {
    return apiError(error);
  }
}

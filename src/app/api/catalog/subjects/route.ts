import {
  parseCatalogSearch,
  CatalogInputError,
} from "@/lib/catalog/official-client";
import { searchSubjectVocabulary } from "@/lib/search/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { term } = parseCatalogSearch(new URL(request.url).searchParams);
    return Response.json(
      { filters: await searchSubjectVocabulary(term) },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    return Response.json(
      { error: "Subject vocabulary unavailable" },
      {
        status: error instanceof CatalogInputError ? 400 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

import {
  CatalogInputError,
  parseCatalogSearch,
  searchOfficialCatalog,
} from "@/lib/catalog/official";
import { searchCatalogMirror } from "@/lib/catalog/mirror";
import type { CatalogSearch } from "@/lib/catalog/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let input: CatalogSearch | undefined;
  try {
    input = parseCatalogSearch(new URL(request.url).searchParams);
    const result = await searchOfficialCatalog({ ...input, limit: 1 });
    return Response.json(
      {
        filters: result.filters,
        terms: result.terms,
        source: result.source,
        fetchedAt: result.fetchedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const invalid = error instanceof CatalogInputError;
    if (!invalid && input) {
      const mirror = await searchCatalogMirror(input, null);
      if (mirror)
        return Response.json(
          {
            filters: mirror.filters,
            terms: mirror.terms,
            source: mirror.source,
            sourceMode: "mirror",
            fetchedAt: mirror.fetchedAt,
            snapshotAt: mirror.snapshotAt,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
    }
    return Response.json(
      {
        error: invalid
          ? error.message
          : "Official course filters are temporarily unavailable.",
      },
      { status: invalid ? 400 : 502 },
    );
  }
}

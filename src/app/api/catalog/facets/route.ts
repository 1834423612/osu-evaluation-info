import {
  CatalogInputError,
  parseCatalogSearch,
} from "@/lib/catalog/official-client";
import { officialPlanResponse } from "@/lib/catalog/official-endpoints";
import { canUseCatalogMirror, searchCatalogMirror } from "@/lib/catalog/mirror";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("mode") !== "snapshot") return officialPlanResponse("facets");
  try {
    const input = parseCatalogSearch(params);
    if (!canUseCatalogMirror(input))
      throw new CatalogInputError("Unsupported snapshot filters.");
    const result = await searchCatalogMirror(input, null);
    if (!result)
      return Response.json(
        { error: "Snapshot filters unavailable." },
        { status: 503 },
      );
    return Response.json(
      {
        filters: result.filters,
        terms: result.terms,
        source: result.source,
        sourceMode: "mirror",
        snapshotAt: result.snapshotAt,
        fetchedAt: result.fetchedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CatalogInputError
            ? error.message
            : "Snapshot filters unavailable.",
      },
      { status: error instanceof CatalogInputError ? 400 : 503 },
    );
  }
}

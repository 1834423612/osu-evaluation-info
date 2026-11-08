import {
  CatalogInputError,
  parseCatalogSearch,
} from "@/lib/catalog/official-client";
import { officialPlanResponse } from "@/lib/catalog/official-endpoints";
import { canUseCatalogMirror, searchCatalogMirror } from "@/lib/catalog/mirror";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("mode") !== "snapshot") return officialPlanResponse("catalog");
  try {
    const input = parseCatalogSearch(params);
    if (!canUseCatalogMirror(input))
      throw new CatalogInputError("Snapshots support broad browsing only.");
    const result = await searchCatalogMirror(input, null);
    if (!result)
      return Response.json(
        { error: "No complete catalog snapshot is available." },
        { status: 503 },
      );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CatalogInputError
            ? error.message
            : "Catalog snapshot unavailable.",
      },
      { status: error instanceof CatalogInputError ? 400 : 503 },
    );
  }
}

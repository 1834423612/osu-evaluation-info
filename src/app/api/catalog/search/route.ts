import {
  CatalogInputError,
  parseCatalogSearch,
} from "@/lib/catalog/official-client";
import { searchPublishedCatalog } from "@/lib/search/service";
import { UnsupportedSearchFilter } from "@/lib/search/filters";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const input = parseCatalogSearch(new URL(request.url).searchParams);
    if (!input.q?.trim())
      throw new CatalogInputError("A search query is required.");
    if (
      input.sort &&
      ![
        "relevance",
        "subject",
        "-subject",
        "catalogNumber",
        "-catalogNumber",
      ].includes(input.sort)
    )
      throw new CatalogInputError("Invalid search order.");
    return Response.json(await searchPublishedCatalog(input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status =
      error instanceof CatalogInputError
        ? 400
        : error instanceof UnsupportedSearchFilter
          ? 422
          : 503;
    return Response.json(
      {
        error:
          status === 400
            ? (error as Error).message
            : status === 422
              ? "This filter requires the live official search."
              : "The course search index is temporarily unavailable.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}

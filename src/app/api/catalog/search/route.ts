import { CourseQueryError, parseCourseQuery } from "@/lib/catalog/course-query";
import {
  CatalogInputError,
  parseCatalogSearch,
} from "@/lib/catalog/official-client";
import { searchPublishedCatalog } from "@/lib/search/service";
import { SearchCapacityError } from "@/lib/search/result-cache";
import { UnsupportedSearchFilter } from "@/lib/search/filters";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  const started = performance.now();
  try {
    const input = parseCatalogSearch(new URL(request.url).searchParams);
    parseCourseQuery(input.q ?? "");
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
    const result = await searchPublishedCatalog(input);
    return Response.json(result, {
      headers: {
        "Cache-Control":
          "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
        "Server-Timing": `search;dur=${Math.round(performance.now() - started)}`,
      },
    });
  } catch (error) {
    const status =
      error instanceof SearchCapacityError
        ? 429
        : error instanceof CatalogInputError ||
            error instanceof CourseQueryError
          ? 400
          : error instanceof UnsupportedSearchFilter
            ? 422
            : 503;
    if (status === 503)
      console.error(
        JSON.stringify({
          event: "catalog.search_unavailable",
          code: /^[A-Z0-9_]{1,64}$/.test(
            String((error as { code?: unknown })?.code),
          )
            ? String((error as { code: unknown }).code)
            : "GENERATION_UNAVAILABLE",
        }),
      );
    return Response.json(
      {
        error:
          status === 429
            ? "Search is busy. Try again shortly."
            : status === 400
              ? (error as Error).message
              : status === 422
                ? "This filter requires the live official search."
                : "The course search index is temporarily unavailable.",
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(status === 429 ? { "Retry-After": "1" } : {}),
        },
      },
    );
  }
}

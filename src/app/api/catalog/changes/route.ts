import { catalogChanges } from "@/lib/catalog/change-feed";
import { parseChangeFilters, ChangeInputError } from "@/lib/catalog/changes";
import { SearchCapacityError } from "@/lib/search/result-cache";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    return Response.json(
      await catalogChanges(
        parseChangeFilters(new URL(request.url).searchParams),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof ChangeInputError
        ? 400
        : error instanceof SearchCapacityError
          ? 429
          : 503;
    return Response.json(
      {
        error:
          status === 400
            ? (error as Error).message
            : "Course updates are temporarily unavailable.",
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

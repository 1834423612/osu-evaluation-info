import { parseRmpLibraryInput } from "@/lib/rmp/library-input";
import { searchRmpLibrary } from "@/lib/rmp/library-repository";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const result = await searchRmpLibrary(
      parseRmpLibraryInput(new URL(request.url).searchParams),
    );
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RangeError
            ? error.message
            : "RMP library unavailable.",
      },
      {
        status: error instanceof RangeError ? 400 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

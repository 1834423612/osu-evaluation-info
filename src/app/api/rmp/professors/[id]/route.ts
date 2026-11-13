import { parseReviewOffset } from "@/lib/rmp/pagination";
import { getRmpProfileDetail } from "@/lib/rmp/library-repository";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const result = await getRmpProfileDetail(
      id,
      params.get("course"),
      parseReviewOffset(params.get("offset") ?? "0"),
    );
    return result
      ? Response.json(result, {
          headers: {
            "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
          },
        })
      : Response.json({ error: "RMP profile not found." }, { status: 404 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RangeError
            ? error.message
            : "RMP reviews unavailable.",
      },
      {
        status: error instanceof RangeError ? 400 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

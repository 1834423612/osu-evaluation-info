import { getInstructorRmpReviews } from "@/lib/rmp/repository";
import { parseReviewOffset } from "@/lib/rmp/pagination";
import { parseRmpScope } from "@/lib/rmp/input";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawOffset = params.get("offset") ?? "0";
  try {
    const offset = parseReviewOffset(rawOffset);
    const result = await getInstructorRmpReviews(
      {
        subject: params.get("subject") ?? "",
        catalogNumber: params.get("catalog") ?? "",
        campus: params.get("campus") ?? "",
        usernames: params.getAll("instructor"),
        instructorScope: parseRmpScope(params.get("scope")),
      },
      params.get("professor") ?? "",
      offset,
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    if (error instanceof RangeError)
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { error: "RMP reviews are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

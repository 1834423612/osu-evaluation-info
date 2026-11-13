import { queryDatabase } from "@/lib/db";
import { normalizeRmpInput, parseRmpScope } from "@/lib/rmp/input";
import { parseReviewOffset } from "@/lib/rmp/pagination";
import { COURSE_LEADS_SQL, type RmpCourseLead } from "@/lib/rmp/course-leads";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const input = normalizeRmpInput({
      subject: params.get("subject") ?? "",
      catalogNumber: params.get("catalog") ?? "",
      campus: params.get("campus") ?? "",
      usernames: params.getAll("instructor"),
      instructorScope: parseRmpScope(params.get("scope")),
    });
    const offset = parseReviewOffset(params.get("offset") ?? "0");
    const result = await queryDatabase<RmpCourseLead & { total: number }>(
      COURSE_LEADS_SQL,
      [
        input.campus,
        `${input.subject}${input.catalogNumber}`.replace(/[\s_-]/g, ""),
        input.usernames,
        input.instructorScope === "course-history",
        offset,
      ],
    );
    const total = result.rows[0]?.total ?? 0;
    return Response.json(
      {
        profiles: result.rows,
        total,
        nextOffset:
          offset + result.rows.length < total
            ? offset + result.rows.length
            : null,
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RangeError
            ? error.message
            : "Related RMP profiles unavailable.",
      },
      {
        status: error instanceof RangeError ? 400 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

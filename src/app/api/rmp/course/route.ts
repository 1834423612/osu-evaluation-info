import { debugBypassRequest } from "@/lib/debug/server";
import { getCourseRmp } from "@/lib/rmp/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const summary = await getCourseRmp(
      {
        subject: params.get("subject") ?? "",
        catalogNumber: params.get("catalog") ?? "",
        campus: params.get("campus") ?? "",
        usernames: params.getAll("instructor"),
      },
      { bypassCache: debugBypassRequest(request) },
    );
    return Response.json(summary, {
      headers: {
        "Cache-Control":
          summary.status === "unavailable" ? "no-store" : "private, max-age=60",
      },
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return Response.json({ error: error.message }, { status: 400 });
  }
}

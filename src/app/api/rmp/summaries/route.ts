import { readJsonBody } from "@/lib/http/json-body";
import { debugBypassRequest } from "@/lib/debug/server";
import {
  aggregateRmpInsights,
  parseRmpPreviewBatch,
  type RmpInsight,
} from "@/lib/rmp/insights";
import { getCourseRmp } from "@/lib/rmp/repository";

export async function POST(request: Request) {
  try {
    const courses = parseRmpPreviewBatch(await readJsonBody(request, 131_072));
    const summaries: Record<string, RmpInsight> = Object.create(null);
    const bypassCache = debugBypassRequest(request);
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, courses.length) }, async () => {
        while (index < courses.length) {
          const course = courses[index++];
          summaries[course.id] = aggregateRmpInsights(
            await getCourseRmp(course, { preview: true, bypassCache }),
          );
        }
      }),
    );
    return Response.json(
      { summaries },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Invalid RMP course batch" },
      { status: 400 },
    );
  }
}

import { getOfficialSectionAvailability } from "@/lib/catalog/official-availability";
import { RequestQueueFullError } from "@/lib/catalog/request-pool";
import {
  validAvailabilityQuery,
  type AvailabilityQuery,
} from "@/lib/catalog/section-availability";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query: AvailabilityQuery = {
    courseId: params.get("courseId") ?? "",
    courseOfferingNumber: params.get("courseOfferingNumber") ?? "",
    classSection: params.get("classSection") ?? "",
    sessionCode: params.get("sessionCode") ?? "",
    termCode: params.get("termCode") ?? "",
  };
  if (!validAvailabilityQuery(query))
    return Response.json(
      { error: "Invalid section availability identifiers." },
      { status: 400 },
    );
  try {
    const availability = await getOfficialSectionAvailability(
      query,
      request.signal,
    );
    return Response.json(
      { availability },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const busy = error instanceof RequestQueueFullError;
    return Response.json(
      {
        error: busy
          ? "Availability queue is busy. Try again shortly."
          : "Official section availability is temporarily unavailable.",
      },
      {
        status: busy ? 429 : 502,
        headers: {
          "Cache-Control": "no-store",
          ...(busy ? { "Retry-After": "5" } : {}),
        },
      },
    );
  }
}

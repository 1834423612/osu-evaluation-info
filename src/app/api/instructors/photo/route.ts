import { instructorPhotoPlan } from "@/lib/people/photo";

export const runtime = "nodejs";

export function GET() {
  return Response.json(instructorPhotoPlan(), {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

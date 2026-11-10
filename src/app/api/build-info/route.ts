import { readCurrentBuildInfo } from "@/lib/layout/build-info.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { version: 1, build: readCurrentBuildInfo() },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    },
  );
}

import { getDatabasePool } from "@/lib/db";
import { planningTable } from "@/lib/planning/namespace";
export const runtime = "nodejs";
export async function GET() {
  try {
    const result = await getDatabasePool().query(
      `SELECT data,fetched_at FROM ${planningTable("academic_calendar")} ORDER BY data->>'date'`,
    );
    return Response.json(
      {
        days: result.rows.map((row) => row.data),
        fetchedAt: result.rows[0]?.fetched_at ?? null,
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
    );
  } catch {
    return Response.json(
      { days: [], error: "Academic calendar unavailable" },
      { status: 503 },
    );
  }
}

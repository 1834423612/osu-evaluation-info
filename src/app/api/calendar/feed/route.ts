import { publicCalendar } from "@/lib/calendar/sharing";
import { exportCalendar } from "@/lib/calendar/ical";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams,
      result = await publicCalendar(
        params.get("id") ?? "",
        params.get("key") ?? "",
      );
    return new Response(
      exportCalendar(
        result.calendars.map((c) => c.title).join(" + "),
        [
          ...new Map(
            result.calendars.flatMap((c) =>
              c.events.map((event) => {
                const id = event.id.startsWith("official-")
                  ? event.id
                  : c.id + "-" + event.id;
                return [id, { ...event, id }] as const;
              }),
            ),
          ).values(),
        ],
        result.id,
      ),
      {
        headers: {
          "Content-Type": "text/calendar;charset=utf-8",
          "Cache-Control": "private,no-store",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return new Response("Calendar unavailable", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

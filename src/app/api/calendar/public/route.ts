import { publicCalendar } from "@/lib/calendar/sharing";
import { userRoute, userJson } from "@/lib/user-data/http";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function GET(request: Request) {
  return userRoute(async () => {
    const params = new URL(request.url).searchParams;
    return userJson(
      await publicCalendar(params.get("id") ?? "", params.get("key") ?? ""),
    );
  });
}

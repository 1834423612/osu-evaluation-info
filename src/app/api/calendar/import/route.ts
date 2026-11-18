import { z } from "zod";
import { accountSession } from "@/lib/auth/server";
import {
  sameOrigin,
  readJson,
  userRoute,
  userJson,
  UserDataError,
} from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
import { readRemoteCalendar } from "@/lib/calendar/remote";
import { parseCalendar } from "@/lib/calendar/ical";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const session = await accountSession(request.headers);
    if (!session?.user.emailVerified)
      throw new UserDataError("unauthorized", 401);
    await checkBudget("calendar-feed", session.user.id, 3600, 30);
    const { url } = await readJson(
      request,
      z.object({ url: z.string().max(2000) }),
    );
    const events = await parseCalendar(await readRemoteCalendar(url));
    return userJson({ events, refreshedAt: new Date().toISOString() });
  });
}

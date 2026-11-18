import { z } from "zod";
import { accountSession } from "@/lib/auth/server";
import { requireInstitutionalIdentity } from "@/lib/auth/institution";
import {
  calendarLinks,
  publishCalendar,
  calendarLinkInput,
} from "@/lib/calendar/sharing";
import {
  sameOrigin,
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
import { getDatabasePool } from "@/lib/db";
import { userDataTable } from "@/lib/user-data/namespace";
export const runtime = "nodejs";
async function user(request: Request) {
  const session = await accountSession(request.headers);
  if (!session?.user.emailVerified)
    throw new UserDataError("unauthorized", 401);
  return session.user;
}
export async function GET(request: Request) {
  return userRoute(async () =>
    userJson({ links: await calendarLinks((await user(request)).id) }),
  );
}
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const account = await user(request);
    await requireInstitutionalIdentity(account);
    const input = await readJson(request, calendarLinkInput);
    return userJson(await publishCalendar(account.id, input));
  });
}
export async function DELETE(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const account = await user(request),
      input = await readJson(request, z.object({ id: z.uuid() }));
    await getDatabasePool().query(
      `UPDATE ${userDataTable("calendar_link")} SET revoked_at=now() WHERE id=$1 AND owner_id=$2`,
      [input.id, account.id],
    );
    return userJson({ ok: true });
  });
}

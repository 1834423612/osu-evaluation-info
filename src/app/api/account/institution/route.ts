import { z } from "zod";
import { accountSession } from "@/lib/auth/server";
import {
  institutionalStatus,
  sendInstitutionCode,
  verifyInstitutionCode,
} from "@/lib/auth/institution";
import {
  userRoute,
  userJson,
  readJson,
  sameOrigin,
  UserDataError,
} from "@/lib/user-data/http";
import { requestNetwork } from "@/lib/user-data/network";
import { queryDatabase } from "@/lib/db";
import { userDataTable as table } from "@/lib/user-data/namespace";
export const runtime = "nodejs";
async function user(request: Request) {
  const session = await accountSession(request.headers);
  if (!session?.user.emailVerified)
    throw new UserDataError("unauthorized", 401);
  return session.user;
}
export async function GET(request: Request) {
  return userRoute(async () => {
    const current = await user(request);
    const profile = await queryDatabase(
      "SELECT display_name,show_name,show_nickname,show_email FROM " +
        table("public_profile") +
        " WHERE user_id=$1",
      [current.id],
    );
    return userJson({
      institution: await institutionalStatus(current),
      profile: profile.rows[0] ?? {
        display_name: "",
        show_name: false,
        show_nickname: false,
        show_email: false,
      },
    });
  });
}
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), email: z.email().max(254) }),
  z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/) }),
  z.object({
    action: z.literal("profile"),
    display_name: z.string().trim().max(60),
    show_name: z.boolean(),
    show_nickname: z.boolean(),
    show_email: z.boolean(),
  }),
]);
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const current = await user(request),
      body = await readJson(request, input, 4096);
    if (body.action === "send")
      await sendInstitutionCode(
        current.id,
        body.email,
        request.headers.get("x-waho-locale") ?? "en",
        requestNetwork(request.headers).address ?? "unresolved",
      );
    else if (body.action === "verify")
      await verifyInstitutionCode(current.id, body.code);
    else
      await queryDatabase(
        "INSERT INTO " +
          table("public_profile") +
          "(user_id,display_name,show_name,show_nickname,show_email) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,show_name=EXCLUDED.show_name,show_nickname=EXCLUDED.show_nickname,show_email=EXCLUDED.show_email,updated_at=now()",
        [
          current.id,
          body.display_name,
          body.show_name,
          body.show_nickname,
          body.show_email,
        ],
      );
    return userJson({
      ok: true,
      institution: await institutionalStatus(current),
    });
  });
}

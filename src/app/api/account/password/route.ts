import { z } from "zod";
import { accountSession, getAuth } from "@/lib/auth/server";
import {
  readJson,
  sameOrigin,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const session = await accountSession(request.headers);
    if (!session || !session.user.emailVerified)
      throw new UserDataError("unauthorized", 401);
    if (Date.now() - new Date(session.session.createdAt).getTime() > 900000)
      throw new UserDataError("reauthenticate", 401);
    const body = await readJson(
      request,
      z.object({ password: z.string().min(8).max(128) }),
      4096,
    );
    await getAuth()!.api.setPassword({
      body: { newPassword: body.password },
      headers: request.headers,
    });
    return userJson({ ok: true });
  });
}

import { accountSession } from "@/lib/auth/server";
import { z } from "zod";
import { exchangeSync } from "@/lib/user-data/sync";
import { syncRequestSchema } from "@/lib/sync/protocol";
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
    if (!session?.user.emailVerified)
      throw new UserDataError("unauthorized", 401);
    const input = await readJson(
      request,
      syncRequestSchema.extend({ accountId: z.string().max(100) }),
      1048576,
    );
    if (input.accountId !== session.user.id)
      throw new UserDataError("account_changed", 409);
    return userJson(await exchangeSync(session.user.id, input));
  });
}

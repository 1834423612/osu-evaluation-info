import { accountSession } from "@/lib/auth/server";
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
    return userJson(
      await exchangeSync(
        session.user.id,
        await readJson(request, syncRequestSchema, 1048576),
      ),
    );
  });
}

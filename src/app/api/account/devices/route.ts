import { accountSession } from "@/lib/auth/server";
import { readAccountDevices } from "@/lib/auth/devices";
import { userJson, userRoute, UserDataError } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    const session = await accountSession(request.headers);
    if (!session) throw new UserDataError("unauthorized", 401);
    return userJson({ devices: await readAccountDevices(session.user.id) });
  });
}

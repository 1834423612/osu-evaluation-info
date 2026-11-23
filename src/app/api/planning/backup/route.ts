import { z } from "zod";
import { accountSession } from "@/lib/auth/server";
import { readPlanningBackup, writePlanningBackup } from "@/lib/planning/cloud";
import { planUploadSchema } from "@/lib/planning/model";
import {
  readJson,
  sameOrigin,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
const requestSchema = z.object({
  accountId: z.string().min(1).max(100),
  version: z.number().int().nonnegative().safe(),
  plan: planUploadSchema.nullable(),
});
export async function GET(request: Request) {
  return userRoute(async () => {
    const session = await accountSession(request.headers);
    if (!session?.user.emailVerified)
      throw new UserDataError("unauthorized", 401);
    return userJson(await readPlanningBackup(session.user.id));
  });
}
export async function PUT(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const session = await accountSession(request.headers);
    if (!session?.user.emailVerified)
      throw new UserDataError("unauthorized", 401);
    const input = await readJson(request, requestSchema, 2097152);
    if (input.accountId !== session.user.id)
      throw new UserDataError("account_changed", 409);
    return userJson(
      await writePlanningBackup(session.user.id, input.version, input.plan),
    );
  });
}

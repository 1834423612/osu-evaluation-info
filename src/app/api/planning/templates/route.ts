import { z } from "zod";
import { accountSession } from "@/lib/auth/server";
import { requireInstitutionalIdentity } from "@/lib/auth/institution";
import { saveRequirementTemplates } from "@/lib/planning/cloud";
import { planSchema } from "@/lib/planning/model";
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
    await requireInstitutionalIdentity(session.user);
    const input = await readJson(
      request,
      z.object({ accountId: z.string().max(100), plan: planSchema }),
      2097152,
    );
    if (input.accountId !== session.user.id)
      throw new UserDataError("account_changed", 409);
    return userJson(
      await saveRequirementTemplates(session.user.id, input.plan),
    );
  });
}

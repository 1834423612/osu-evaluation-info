import { z } from "zod";
import { accountSession } from "@/lib/auth/server";
import { requireInstitutionalIdentity } from "@/lib/auth/institution";
import {
  listPlanningShares,
  publishPlanningShare,
  revokePlanningShare,
  planningShareInput,
} from "@/lib/planning/sharing";
import {
  sameOrigin,
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
async function user(request: Request) {
  const session = await accountSession(request.headers);
  if (!session?.user.emailVerified)
    throw new UserDataError("unauthorized", 401);
  return session.user;
}
export async function GET(request: Request) {
  return userRoute(async () =>
    userJson({ shares: await listPlanningShares((await user(request)).id) }),
  );
}
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const account = await user(request);
    await requireInstitutionalIdentity(account);
    const input = await readJson(request, planningShareInput, 524288);
    return userJson(await publishPlanningShare(account.id, input), 201);
  });
}
export async function DELETE(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const account = await user(request),
      input = await readJson(request, z.object({ id: z.uuid() }));
    await revokePlanningShare(account.id, input.id);
    return userJson({ ok: true });
  });
}

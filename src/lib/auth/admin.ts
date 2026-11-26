import { accountSession } from "./server.ts";
import { hasAdminRole } from "./admin-roles.ts";
import { rmpAdminAccess, rmpResearchTokenSupplied } from "../rmp/admin-auth.ts";
import { sameOrigin, UserDataError } from "../user-data/http.ts";
export type AdminAccess = {
  actor: string;
  development: boolean;
  userId?: string;
};
export async function authorizeAdminRequest(
  request: Request,
): Promise<AdminAccess> {
  if (rmpResearchTokenSupplied(request))
    throw new UserDataError("machine_token_cannot_apply", 403);
  const development = rmpAdminAccess(request, null);
  if (development) return development;
  const account = await accountSession(request.headers);
  // Re-read the role for every request; cookie claims never cache authority.
  const role = account?.user.emailVerified
    ? await hasAdminRole(account.user.id)
    : false;
  const access = rmpAdminAccess(
    request,
    account,
    process.env,
    Date.now(),
    role,
  );
  if (!access) throw new UserDataError("forbidden", 403);
  return { ...access, userId: account!.user.id };
}
export function assertAdminOrigin(request: Request, access: AdminAccess) {
  if (!access.development) {
    sameOrigin(request);
    return;
  }
  const target = new URL(request.url),
    authority = request.headers.get("host") ?? target.host;
  if (
    request.headers.get("origin") !== target.protocol + "//" + authority ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new UserDataError("origin", 403);
}

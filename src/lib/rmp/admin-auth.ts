import { validIngressProof } from "../../../scripts/rmp/dev-ingress-proof.mjs";
import { debugSessionToken, validDebugSession } from "../debug/server.ts";
type AdminAccount = {
  user: { id: string; email: string; emailVerified: boolean };
  session: { createdAt: Date | string };
} | null;
export function rmpResearchTokenSupplied(request: Request) {
  return /waho-rmp-ai_/i.test(request.headers.get("authorization") ?? "");
}
export function rmpAdminAccess(
  request: Request,
  account: AdminAccount,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
  accountIsAdmin = false,
) {
  if (rmpResearchTokenSupplied(request)) return null;
  const target = new URL(request.url);
  if (
    env.NODE_ENV === "development" &&
    validIngressProof(
      request.headers.get("x-rmp-ingress"),
      request.method,
      target.pathname + target.search,
      env.RMP_DEV_INGRESS_SECRET,
      now,
    )
  )
    return { actor: "development:private-network", development: true };
  const created = account ? new Date(account.session.createdAt).getTime() : NaN;
  if (
    !account?.user.emailVerified ||
    !accountIsAdmin ||
    !Number.isFinite(created) ||
    created > now + 1000 ||
    now - created > 30 * 60_000 ||
    !validDebugSession(debugSessionToken(request), env.DEV_DEBUG_KEY ?? "", now)
  )
    return null;
  return { actor: "account:" + account.user.id, development: false };
}

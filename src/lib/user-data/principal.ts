import { randomBytes, randomUUID } from "node:crypto";
import { accountSession } from "../auth/server.ts";
import { queryDatabase } from "../db.ts";
import { privateDigest, checkBudget } from "./rate-limit.ts";
import { userDataTable } from "./namespace.ts";
export type Actor = {
  id: string | null;
  owners: string[];
  cookie?: string;
  accountId?: string;
};
function guestCookie() {
  return process.env.NODE_ENV === "production"
    ? "__Host-waho_guest"
    : "waho_guest";
}
function cookieToken(request: Request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(guestCookie() + "="))
    ?.slice(guestCookie().length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export async function actorFor(
  request: Request,
  create = false,
): Promise<Actor> {
  const session = await accountSession(request.headers);
  const token = cookieToken(request);
  let guest: string | null = null;
  if (token) {
    const r = await queryDatabase<{ id: string }>(
      "SELECT id FROM " +
        userDataTable("principal") +
        " WHERE token_digest=$1 AND expires_at>now()",
      [privateDigest(token, "guest")],
    );
    guest = r.rows[0]?.id ?? null;
  }
  if (session) {
    const id = "u:" + session.user.id;
    if (create)
      await queryDatabase(
        "INSERT INTO " +
          userDataTable("principal") +
          "(id,account_id) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
        [id, session.user.id],
      );
    return {
      id,
      accountId: session.user.id,
      owners: [id, ...(guest ? [guest] : [])],
    };
  }
  if (guest) return { id: guest, owners: [guest] };
  if (!create) return { id: null, owners: [] };
  await checkBudget("guest-create", "all", 60, 300);
  const secret = randomBytes(32).toString("base64url"),
    id = "g:" + randomUUID();
  await queryDatabase(
    "INSERT INTO " +
      userDataTable("principal") +
      "(id,token_digest,expires_at) VALUES($1,$2,now()+interval '90 days')",
    [id, privateDigest(secret, "guest")],
  );
  return {
    id,
    owners: [id],
    cookie:
      guestCookie() +
      "=" +
      secret +
      "; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000" +
      (process.env.NODE_ENV === "production" ? "; Secure" : ""),
  };
}
export function actorResponse(response: Response, actor: Actor) {
  if (actor.cookie) response.headers.append("Set-Cookie", actor.cookie);
  return response;
}

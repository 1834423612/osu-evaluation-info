import { createHmac, timingSafeEqual } from "node:crypto";

export const DEBUG_COOKIE = "course-atlas-debug";
export function equalDebugKey(supplied: string, expected: string) {
  if (!expected || supplied.length > 512) return false;
  const a = createHmac("sha256", expected).update(supplied).digest();
  const b = createHmac("sha256", expected).update(expected).digest();
  return timingSafeEqual(a, b);
}
export function signDebugSession(expiresAt: number, secret: string) {
  const payload = String(expiresAt);
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function validDebugSession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
) {
  if (!token || !secret || !/^\d{13}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, signature] = token.split(".");
  if (
    !/^\d{13}$/.test(expires) ||
    !/^[a-f0-9]{64}$/.test(signature ?? "") ||
    Number(expires) <= now ||
    Number(expires) > now + 8 * 3_600_000 + 60_000
  )
    return false;
  const expected = signDebugSession(Number(expires), secret).split(".")[1];
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}
export function debugSessionToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${DEBUG_COOKIE}=`))
    ?.slice(DEBUG_COOKIE.length + 1);
}
export function debugAuthorized(request: Request) {
  if (process.env.NODE_ENV === "development") return true;
  return validDebugSession(
    debugSessionToken(request),
    process.env.DEV_DEBUG_KEY ?? "",
  );
}
export function debugBypassRequest(request: Request) {
  return (
    request.headers.get("x-course-atlas-debug") === "bypass" &&
    debugAuthorized(request)
  );
}

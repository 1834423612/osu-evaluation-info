import {
  DEBUG_COOKIE,
  debugAuthorized,
  debugSessionToken,
  equalDebugKey,
  signDebugSession,
} from "@/lib/debug/server";
import { readJsonBody } from "@/lib/http/json-body";

const attempts = new Map<string, { count: number; until: number }>();
export async function GET(request: Request) {
  return Response.json(
    {
      authorized: debugAuthorized(request),
      configured: !!process.env.DEV_DEBUG_KEY,
      expiresAt:
        process.env.NODE_ENV === "development"
          ? Date.now() + 8 * 3_600_000
          : Number(debugSessionToken(request)?.split(".")[0] ?? 0),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until < now) attempts.delete(key);
  if (attempts.size >= 1000 && !attempts.has(address))
    return Response.json({ error: "Try later" }, { status: 429 });
  const rate = attempts.get(address) ?? { count: 0, until: now + 60_000 };
  attempts.set(address, { ...rate, count: rate.count + 1 });
  if (rate.count >= 8)
    return Response.json({ error: "Try later" }, { status: 429 });
  let supplied: unknown;
  try {
    supplied = ((await readJsonBody(request, 2048)) as { key?: unknown })?.key;
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    typeof supplied !== "string" ||
    !equalDebugKey(supplied, process.env.DEV_DEBUG_KEY ?? "")
  )
    return Response.json({ error: "Incorrect key" }, { status: 403 });
  const expiresAt = now + 8 * 3_600_000;
  const token = signDebugSession(expiresAt, process.env.DEV_DEBUG_KEY!);
  attempts.delete(address);
  return Response.json(
    { authorized: true, expiresAt },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${DEBUG_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      },
    },
  );
}
export async function DELETE() {
  return Response.json(
    { authorized: false },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `${DEBUG_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
      },
    },
  );
}

import { getAuth } from "@/lib/auth/server";
import { z } from "zod";
import {
  userJson,
  readJson,
  sameOrigin,
  userRoute,
} from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
export const runtime = "nodejs";
async function handle(request: Request) {
  const auth = getAuth();
  if (!auth)
    return userJson({ error: "Authentication is not configured" }, 503);
  if (
    request.method === "POST" &&
    Number(request.headers.get("content-length")) > 32768
  )
    return userJson({ error: "too_large" }, 413);
  return userRoute(async () => {
    if (request.method === "POST") {
      sameOrigin(request);
      const body = await readJson(
        request.clone(),
        z.record(z.string(), z.unknown()),
        32768,
      );
      if (
        typeof body.name === "string" &&
        (!body.name.trim() || body.name.length > 60)
      )
        return userJson({ error: "invalid_name" }, 400);
      if (new URL(request.url).pathname.endsWith("/sign-in/email")) {
        const email = z.email().max(254).parse(body.email).toLowerCase();
        await checkBudget("password-email", email, 60, 5);
      }
      if (
        /\/(?:send-verification-otp|request-password-reset)$/.test(
          new URL(request.url).pathname,
        )
      ) {
        const email = z.email().max(254).parse(body.email).toLowerCase();
        await checkBudget("mail-address", email, 600, 3);
        await checkBudget("mail-global", "all", 3600, 1000);
      }
    }
    const response = await auth.handler(request);
    if (response.status >= 500)
      return userJson(
        { error: "Authentication is temporarily unavailable" },
        503,
      );
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
export const GET = handle;
export const POST = handle;

import { getAuth } from "./server.ts";
import { z } from "zod";
import {
  userJson,
  readJson,
  sameOrigin,
  userRoute,
} from "../user-data/http.ts";
import { requestNetwork } from "../user-data/network.ts";
import { checkBudget, reserveCooldown } from "../user-data/rate-limit.ts";
export async function handleAuthRequest(request: Request, auth = getAuth()) {
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
      const network = requestNetwork(request.headers);
      await checkBudget("auth-source", network.address ?? "unresolved", 60, 60);
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
      if (
        /\/(?:sign-in\/email|sign-in\/email-otp|verify-email|reset-password|check-verification-otp)$/.test(
          new URL(request.url).pathname,
        )
      ) {
        const email = z.email().max(254).parse(body.email).toLowerCase();
        await checkBudget("auth-verify-email", email, 600, 12);
      }
      if (
        /\/(?:send-verification-otp|request-password-reset|sign-up\/email)$/.test(
          new URL(request.url).pathname,
        )
      ) {
        const email = z.email().max(254).parse(body.email).toLowerCase();
        await reserveCooldown("mail-cooldown", email, 60);
        await checkBudget("mail-address", email, 3600, 6);
        await checkBudget(
          "mail-source",
          network.address ?? "unresolved",
          3600,
          30,
        );
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

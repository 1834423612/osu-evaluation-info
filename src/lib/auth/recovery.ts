import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { checkBudget } from "../user-data/rate-limit.ts";
export function newRecoveryCode() {
  return (
    "WAHO-" +
    randomBytes(16).toString("hex").toUpperCase().match(/.{4}/g)!.join("-")
  );
}
export function recoveryDigest(code: string) {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/^WAHO-/, "")
    .replaceAll("-", "");
  if (!/^[A-F0-9]{32}$/.test(normalized))
    throw new Error("Invalid recovery code");
  return createHash("sha256")
    .update("waho:recovery:" + normalized)
    .digest("hex");
}
export function recoveryPlugin() {
  return {
    id: "waho-recovery",
    schema: {
      user: {
        fields: {
          recoveryGeneration: {
            type: "string" as const,
            required: false,
            input: false,
            returned: false,
          },
        },
      },
    },
    endpoints: {
      generateRecoveryCodes: createAuthEndpoint(
        "/recovery/generate",
        { method: "POST", body: z.object({}), use: [sessionMiddleware] },
        async (ctx) => {
          const current = ctx.context.session;
          if (
            !current ||
            !current.user.emailVerified ||
            Date.now() - new Date(current.session.createdAt).getTime() > 900000
          )
            throw new APIError("UNAUTHORIZED", {
              message: "Sign in again first",
            });
          try {
            await checkBudget("recovery-generation", current.user.id, 3600, 4);
          } catch {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Try again later",
            });
          }
          const user = (await ctx.context.internalAdapter.findUserById(
            current.user.id,
          )) as { id: string; recoveryGeneration?: string } | null;
          const generation = randomUUID(),
            codes = Array.from({ length: 10 }, newRecoveryCode),
            expiresAt = new Date(Date.now() + 365 * 86400000);
          for (const code of codes)
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: "recovery:" + recoveryDigest(code),
              value: current.user.id + ":" + generation,
              expiresAt,
            });
          await ctx.context.internalAdapter.updateUser(current.user.id, {
            recoveryGeneration: generation,
          });
          if (user?.recoveryGeneration)
            await ctx.context.adapter.deleteMany({
              model: "verification",
              where: [
                {
                  field: "value",
                  value: user.id + ":" + user.recoveryGeneration,
                },
                {
                  field: "identifier",
                  operator: "starts_with",
                  value: "recovery:",
                },
              ],
            });
          return ctx.json({ codes, expiresAt: expiresAt.toISOString() });
        },
      ),
      verifyRecoveryCode: createAuthEndpoint(
        "/recovery/verify",
        { method: "POST", body: z.object({ code: z.string().max(100) }) },
        async (ctx) => {
          try {
            await checkBudget("recovery-verification", "all", 60, 60);
          } catch {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Try again later",
            });
          }
          let digest: string;
          try {
            digest = recoveryDigest(ctx.body.code);
          } catch {
            throw new APIError("BAD_REQUEST", {
              message: "Invalid recovery code",
            });
          }
          const identifier = "recovery:" + digest;
          const record =
            await ctx.context.internalAdapter.consumeVerificationValue(
              identifier,
            );
          if (!record || new Date(record.expiresAt).getTime() <= Date.now())
            throw new APIError("BAD_REQUEST", {
              message: "Invalid recovery code",
            });
          const [userId, generation] = record.value.split(":");
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (
            !user ||
            !user.emailVerified ||
            (user as typeof user & { recoveryGeneration?: string })
              .recoveryGeneration !== generation
          )
            throw new APIError("BAD_REQUEST", {
              message: "Invalid recovery code",
            });
          let session;
          try {
            session = await ctx.context.internalAdapter.createSession(user.id);
            if (!session) throw Error("Session unavailable");
            await setSessionCookie(ctx, { session, user });
          } catch {
            if (session)
              await ctx.context.internalAdapter.deleteSession(session.token);
            await ctx.context.internalAdapter.createVerificationValue({
              identifier,
              value: record.value,
              expiresAt: record.expiresAt,
            });
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "Recovery temporarily unavailable",
            });
          }
          return ctx.json({ ok: true });
        },
      ),
    },
  } as const;
}

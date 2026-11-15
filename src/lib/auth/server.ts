import { recoveryPlugin } from "./recovery.ts";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { emailOTP } from "better-auth/plugins/email-otp";
import { passkey } from "@better-auth/passkey";
import { getAuthPool } from "./database.ts";
import {
  authBaseURL,
  authOrigins,
  authConfigured,
  authTablePrefix,
  otpDigest,
} from "./config.ts";
import { sendSignInCode } from "./mail.ts";
export function createAuth(
  overrides: { deliverCode?: typeof sendSignInCode } = {},
) {
  const baseURL = authBaseURL()!;
  const prefix = authTablePrefix();
  return betterAuth({
    appName: "WahO!",
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET!,
    database: getAuthPool(),
    trustedOrigins: authOrigins(),
    user: { modelName: prefix + "user" },
    session: {
      modelName: prefix + "session",
      expiresIn: 30 * 86400,
      updateAge: 86400,
      freshAge: 900,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: prefix + "account",
      accountLinking: { enabled: false },
    },
    verification: { modelName: prefix + "verification" },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: prefix + "rate_limit",
      window: 60,
      max: 120,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        "/email-otp/*": { window: 60, max: 5 },
      },
    },
    advanced: {
      cookiePrefix: "waho",
      database: { generateId: () => randomUUID() },
      ipAddress: {
        disableIpTracking: false,
        ipAddressHeaders: process.env.USER_DATA_TRUSTED_PROXY_HEADER
          ? [process.env.USER_DATA_TRUSTED_PROXY_HEADER]
          : [],
      },
    },
    logger: { disabled: true },
    plugins: [
      recoveryPlugin(),
      emailOTP({
        expiresIn: 300,
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        otpLength: 6,
        allowedAttempts: 3,
        storeOTP: {
          hash: async (otp) => otpDigest(otp, process.env.BETTER_AUTH_SECRET!),
        },
        rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: async (data, ctx) => {
          await (overrides.deliverCode ?? sendSignInCode)(
            data.email,
            data.otp,
            ctx?.headers?.get("x-waho-locale") || "en",
          );
        },
      }),
      passkey({
        rpID: new URL(baseURL).hostname,
        rpName: "WahO!",
        origin: baseURL,
        authenticatorSelection: { userVerification: "required" },
        authentication: {
          afterVerification: async ({ ctx, clientData }) => {
            const email = z
              .email()
              .max(254)
              .safeParse(
                ctx.headers?.get("x-waho-passkey-email")?.trim().toLowerCase(),
              );
            const credential = await ctx.context.adapter.findOne<{
              userId: string;
            }>({
              model: "passkey",
              where: [{ field: "credentialID", value: clientData.id }],
            });
            const user = credential
              ? await ctx.context.internalAdapter.findUserById(
                  credential.userId,
                )
              : null;
            if (
              !email.success ||
              !user ||
              user.email.toLowerCase() !== email.data ||
              !user.emailVerified
            )
              throw new APIError("UNAUTHORIZED", {
                code: "PASSKEY_EMAIL_MISMATCH",
                message: "Use a passkey registered to the email you entered.",
              });
          },
        },
        schema: { passkey: { modelName: prefix + "passkey" } },
      }),
    ],
  });
}
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!authConfigured()) return null;
  return (auth ??= createAuth());
}
export async function accountSession(headers: Headers) {
  const auth = getAuth();
  if (!auth) return null;
  return auth.api.getSession({ headers });
}

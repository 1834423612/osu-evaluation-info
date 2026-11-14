import { recoveryPlugin } from "./recovery.ts";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins/email-otp";
import { passkey } from "@better-auth/passkey";
import { getDatabasePool } from "../db.ts";
import {
  authBaseURL,
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
    database: getDatabasePool(),
    trustedOrigins: [baseURL],
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
      disableSignUp: true,
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
      max: 600,
    },
    advanced: {
      cookiePrefix: "waho",
      database: { generateId: () => randomUUID() },
      ipAddress: {
        disableIpTracking: !process.env.USER_DATA_TRUSTED_PROXY_HEADER,
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

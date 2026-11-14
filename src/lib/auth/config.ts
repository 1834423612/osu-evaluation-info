import { createHmac } from "node:crypto";
export function authBaseURL(env: NodeJS.ProcessEnv = process.env) {
  const raw =
    env.NODE_ENV === "production"
      ? env.AUTH_BASE_URL || env.SITE_URL
      : env.AUTH_DEV_BASE_URL || "http://localhost:3000";
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash ||
      !["http:", "https:"].includes(u.protocol) ||
      (env.NODE_ENV === "production" && u.protocol !== "https:")
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
export function authTablePrefix(env: NodeJS.ProcessEnv = process.env) {
  const prefix = env.AUTH_TABLE_PREFIX || "ca_";
  if (!/^[a-z][a-z0-9_]{0,35}_$/.test(prefix))
    throw new Error("Invalid authentication table prefix");
  return prefix;
}
export function authConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!(
    authBaseURL(env) &&
    env.DATABASE_URL &&
    env.BETTER_AUTH_SECRET &&
    env.BETTER_AUTH_SECRET.length >= 32
  );
}
export function mailConfigured(env: NodeJS.ProcessEnv = process.env) {
  return !!(env.SMTP_HOST && env.SMTP_FROM);
}
export function otpDigest(otp: string, secret: string) {
  return createHmac("sha256", secret)
    .update("waho:email-otp:" + otp)
    .digest("hex");
}

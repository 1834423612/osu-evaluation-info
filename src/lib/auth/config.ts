import { createHmac } from "node:crypto";
import { isIP } from "node:net";
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
/** Development aliases are evaluated for the current same-origin request. */
export function authOrigins(
  env: NodeJS.ProcessEnv = process.env,
  request?: Request,
) {
  const base = authBaseURL(env);
  if (!base) return [];
  const url = new URL(base);
  if (
    env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    return [base];
  const origins = [
    base,
    ...["localhost", "127.0.0.1", "[::1]"].map(
      (host) => url.protocol + "//" + host + (url.port ? ":" + url.port : ""),
    ),
  ].filter((origin, index, origins) => origins.indexOf(origin) === index);
  if (request) {
    const target = new URL(request.url);
    // Next can construct request.url from its listen hostname. Host preserves
    // the HTTP authority used by the browser, including a Tailscale address.
    const authority = request.headers.get("host") ?? target.host;
    let candidate: URL;
    try {
      candidate = new URL(target.protocol + "//" + authority);
    } catch {
      return origins;
    }
    const origin = request.headers.get("origin");
    const octets = candidate.hostname.split(".").map(Number);
    if (
      isIP(candidate.hostname) === 4 &&
      octets[0] === 100 &&
      octets[1] >= 64 &&
      octets[1] <= 127 &&
      target.protocol === url.protocol &&
      candidate.port === url.port &&
      origin === candidate.origin &&
      candidate.host === authority
    )
      origins.push(origin);
  }
  return origins;
}
export function authTablePrefix(env: NodeJS.ProcessEnv = process.env) {
  const prefix = env.AUTH_TABLE_PREFIX || "";
  if (prefix && !/^[a-z][a-z0-9_]{0,35}_$/.test(prefix))
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

export function authSchema(env: NodeJS.ProcessEnv = process.env) {
  const name =
    env.AUTH_SCHEMA ||
    (env.NODE_ENV === "production" ? "osu_identity" : "osu_identity_dev");
  if (!/^[a-z][a-z0-9_]{0,50}$/.test(name))
    throw Error("Invalid account schema");
  return name;
}

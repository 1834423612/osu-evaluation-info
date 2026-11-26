import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
export const INGRESS_HEADER = "x-rmp-ingress";
export function privateAdminPeer(raw) {
  const ip = raw?.replace(/^::ffff:/, "");
  if (ip === "::1" || (isIP(ip ?? "") === 4 && ip.split(".")[0] === "127"))
    return true;
  const parts = (ip ?? "").split(".").map(Number);
  return (
    isIP(ip ?? "") === 4 &&
    parts[0] === 100 &&
    parts[1] >= 64 &&
    parts[1] <= 127
  );
}
export function signIngressProof(peer, method, path, secret, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify([peer, method, path, now]),
  ).toString("base64url");
  return (
    payload + "." + createHmac("sha256", secret).update(payload).digest("hex")
  );
}
export function readSignedIngressProof(token, secret) {
  if (!secret || secret.length < 64 || !token || token.length > 2048)
    return null;
  const [payload, mac, extra] = token.split(".");
  if (extra || !/^[a-f0-9]{64}$/.test(mac ?? "")) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (!timingSafeEqual(Buffer.from(mac, "hex"), expected)) return null;
  try {
    const [peer, signedMethod, signedPath, time] = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    );
    if (
      typeof peer !== "string" ||
      typeof signedMethod !== "string" ||
      typeof signedPath !== "string" ||
      !Number.isFinite(time)
    )
      return null;
    return { peer, method: signedMethod, path: signedPath, time };
  } catch {
    return null;
  }
}
export function validIngressProof(
  token,
  method,
  path,
  secret,
  now = Date.now(),
) {
  const signed = readSignedIngressProof(token, secret);
  return (
    !!signed &&
    privateAdminPeer(signed.peer) &&
    signed.method === method &&
    signed.path === path &&
    signed.time <= now + 1000 &&
    now - signed.time < 30000
  );
}

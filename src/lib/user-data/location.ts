import { isIP } from "node:net";
type Place = { country: string; region: string; city: string };
const cache = new Map<
  string,
  { until: number; value: Promise<Place | null> }
>();
export async function networkLocation(
  ip: string | null,
): Promise<Place | null> {
  if (
    !ip ||
    !isIP(ip) ||
    /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|f[cd]|fe80)/i.test(
      ip,
    )
  )
    return null;
  const old = cache.get(ip);
  if (old && old.until > Date.now()) return old.value;
  const value = (async () => {
    try {
      const r = await fetch(
        "https://ipwho.is/" +
          encodeURIComponent(ip) +
          "?fields=success,country,region,city",
        { signal: AbortSignal.timeout(2000), redirect: "error" },
      );
      if (!r.ok) return null;
      const d = await r.json();
      if (d.success !== true) return null;
      return {
        country: String(d.country ?? "").slice(0, 100),
        region: String(d.region ?? "").slice(0, 100),
        city: String(d.city ?? "").slice(0, 100),
      };
    } catch {
      return null;
    }
  })();
  cache.set(ip, { until: Date.now() + 86400000, value });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return value;
}

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
    /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.|0\.|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|2001:db8(?::|$)|::(?:1)?$|f[cd]|fe[89ab]|ff)/i.test(
      ip.replace(/^::ffff:/i, ""),
    )
  )
    return null;
  const old = cache.get(ip);
  if (old && old.until > Date.now()) return old.value;
  const value = (async () => {
    for (const endpoint of [
      "https://ipwho.is/" +
        encodeURIComponent(ip) +
        "?fields=success,country,region,city",
      "https://get.geojs.io/v1/ip/geo/" + encodeURIComponent(ip) + ".json",
      "https://ipapi.co/" + encodeURIComponent(ip) + "/json/",
    ]) {
      try {
        const r = await fetch(endpoint, {
          signal: AbortSignal.timeout(1800),
          redirect: "error",
          referrerPolicy: "no-referrer",
        });
        if (!r.ok) continue;
        const d = await r.json();
        if (d.success === false || d.error) continue;
        if (!d.country && !d.country_name) continue;
        return {
          country: String(d.country_name ?? d.country ?? "").slice(0, 100),
          region: String(d.region ?? "").slice(0, 100),
          city: String(d.city ?? "").slice(0, 100),
        };
      } catch {}
    }
    return null;
  })();
  cache.set(ip, { until: Date.now() + 86400000, value });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return value;
}

import { z } from "zod";
export const publicNetworkSchema = z
  .object({
    ip: z.union([z.ipv4(), z.ipv6()]),
    source: z.enum(["geojs", "ipapi", "ipify"]),
    country: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    organization: z.string().max(200).optional(),
  })
  .strict();
export type PublicNetwork = z.infer<typeof publicNetworkSchema>;
const providers = [
  { source: "geojs", url: "https://get.geojs.io/v1/ip/geo.json" },
  { source: "ipapi", url: "https://ipapi.co/json/" },
  { source: "ipify", url: "https://api64.ipify.org?format=json" },
] as const;
const value = (raw: unknown, max = 100) =>
  typeof raw === "string" ? raw.slice(0, max) : undefined;
export async function lookupPublicNetwork(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<PublicNetwork | null> {
  for (const provider of providers) {
    if (signal?.aborted) return null;
    try {
      const r = await fetcher(provider.url, {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(2200)])
          : AbortSignal.timeout(2200),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "error",
        cache: "no-store",
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d.error || d.success === false) continue;
      const parsed = publicNetworkSchema.safeParse({
        ip: d.ip,
        source: provider.source,
        country: value(d.country_name ?? d.country),
        region: value(d.region),
        city: value(d.city),
        organization: value(d.organization_name ?? d.org, 200),
      });
      if (parsed.success) return parsed.data;
    } catch {}
  }
  return null;
}

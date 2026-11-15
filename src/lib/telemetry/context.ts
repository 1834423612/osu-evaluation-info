import { z } from "zod";
import {
  publicNetworkSchema,
  lookupPublicNetwork,
  type PublicNetwork,
} from "./network.ts";
export const browserContextSchema = z
  .object({
    screen: z
      .object({
        width: z.number().int().min(0).max(50000),
        height: z.number().int().min(0).max(50000),
        ratio: z.number().min(0).max(20),
        depth: z.number().int().min(0).max(128),
      })
      .strict(),
    viewport: z
      .object({
        width: z.number().int().min(0).max(50000),
        height: z.number().int().min(0).max(50000),
      })
      .strict(),
    platform: z.string().max(100),
    model: z.string().max(100).optional(),
    architecture: z.string().max(40).optional(),
    bitness: z.string().max(10).optional(),
    browserVersion: z.string().max(100).optional(),
    network: publicNetworkSchema.optional(),
    platformVersion: z.string().max(100).optional(),
    cores: z.number().int().min(0).max(1024),
    memory: z.number().min(0).max(10000).optional(),
    touch: z.number().int().min(0).max(100),
    cookies: z.boolean(),
    online: z.boolean(),
    colorScheme: z.enum(["light", "dark"]),
    reducedMotion: z.boolean(),
    connection: z
      .object({
        type: z.string().max(30).optional(),
        downlink: z.number().min(0).max(100000).optional(),
        rtt: z.number().min(0).max(100000).optional(),
        saveData: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type BrowserContext = z.infer<typeof browserContextSchema>;
let modelHints: {
  model?: string;
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
  browserVersion?: string;
} = {};
let networkHints: PublicNetwork | null = null;
let preparing: Promise<void> | null = null;
export function prepareBrowserContext() {
  return (preparing ??= prepare());
}
async function prepare() {
  const ua = (
    navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues?: (
          fields: string[],
        ) => Promise<Record<string, unknown>>;
      };
    }
  ).userAgentData;
  try {
    const hints = await ua?.getHighEntropyValues?.([
      "model",
      "platformVersion",
      "architecture",
      "bitness",
      "fullVersionList",
    ]);
    modelHints = {
      ...(typeof hints?.architecture === "string"
        ? { architecture: hints.architecture.slice(0, 40) }
        : {}),
      ...(typeof hints?.bitness === "string"
        ? { bitness: hints.bitness.slice(0, 10) }
        : {}),
      ...(Array.isArray(hints?.fullVersionList)
        ? {
            browserVersion: hints.fullVersionList
              .map((v) =>
                typeof v?.brand === "string" && typeof v?.version === "string"
                  ? v.brand + " " + v.version
                  : "",
              )
              .filter(Boolean)
              .join("; ")
              .slice(0, 100),
          }
        : {}),
      ...(typeof hints?.model === "string"
        ? { model: hints.model.slice(0, 100) }
        : {}),
      ...(typeof hints?.platformVersion === "string"
        ? { platformVersion: hints.platformVersion.slice(0, 100) }
        : {}),
    };
  } catch {}
  try {
    const r = await fetch("/api/diagnostics/context", {
      signal: AbortSignal.timeout(1800),
      cache: "no-store",
    });
    const data = r.ok ? await r.json() : null;
    if (
      !data?.results?.some(
        (row: { id: string; status: string }) =>
          row.id === "ip" && row.status === "available",
      )
    )
      networkHints = await lookupPublicNetwork();
  } catch {
    networkHints = await lookupPublicNetwork();
  }
}
export function browserContext(): BrowserContext {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { platform?: string };
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  };
  return browserContextSchema.parse({
    ...modelHints,
    ...(networkHints ? { network: networkHints } : {}),
    screen: {
      width: screen.width,
      height: screen.height,
      ratio: devicePixelRatio,
      depth: screen.colorDepth,
    },
    viewport: { width: innerWidth, height: innerHeight },
    platform: nav.userAgentData?.platform ?? navigator.platform,
    cores: navigator.hardwareConcurrency ?? 0,
    memory: nav.deviceMemory,
    touch: navigator.maxTouchPoints ?? 0,
    cookies: navigator.cookieEnabled,
    online: navigator.onLine,
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    connection: nav.connection
      ? {
          type: nav.connection.effectiveType,
          downlink: nav.connection.downlink,
          rtt: nav.connection.rtt,
          saveData: nav.connection.saveData,
        }
      : undefined,
  });
}

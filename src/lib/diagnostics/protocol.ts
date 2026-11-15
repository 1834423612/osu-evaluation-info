import { z } from "zod";
import inventory from "./registry.json" with { type: "json" };
export const registry = inventory;
export const diagnosticIds = new Set(registry.map((r) => r.id));
export const statusSchema = z.enum([
  "available",
  "unsupported",
  "denied",
  "blocked",
  "timed_out",
  "failed",
  "not_configured",
  "not_run",
]);
export type DiagnosticStatus = z.infer<typeof statusSchema>;
export type DiagnosticValue =
  | null
  | boolean
  | number
  | string
  | DiagnosticValue[]
  | { [key: string]: DiagnosticValue };
export function boundedValue(value: unknown): value is DiagnosticValue {
  const queue = [{ value, depth: 0 }];
  let nodes = 0;
  while (queue.length) {
    const { value: current, depth } = queue.pop()!;
    if (++nodes > 2000 || depth > 8) return false;
    if (current === null || typeof current === "boolean") continue;
    if (typeof current === "string") {
      if (current.length > 4096) return false;
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return false;
      continue;
    }
    if (typeof current !== "object") return false;
    if (Array.isArray(current)) {
      if (current.length > 256) return false;
      queue.push(...current.map((value) => ({ value, depth: depth + 1 })));
    } else {
      const entries = Object.entries(current);
      if (
        entries.length > 256 ||
        entries.some(
          ([key]) =>
            key.length > 80 ||
            /^(?:__proto__|constructor|prototype|password|authorization|privateKey|recoveryCode|accessToken|refreshToken|cookie)$/i.test(
              key,
            ),
        )
      )
        return false;
      queue.push(...entries.map(([, value]) => ({ value, depth: depth + 1 })));
    }
  }
  return new TextEncoder().encode(JSON.stringify(value)).length <= 16384;
}
export const diagnosticResultSchema = z
  .object({
    id: z.string().refine((id) => diagnosticIds.has(id)),
    status: statusSchema,
    source: z.enum([
      "browser",
      "server",
      "trusted_proxy",
      "configured_probe",
      "heuristic",
      "local_file",
    ]),
    value: z.unknown().refine(boundedValue).optional(),
    detail: z.string().max(160).optional(),
    duration: z.number().finite().min(0).max(120000),
  })
  .strict()
  .refine((r) => r.status !== "available" || r.value !== undefined);
export type DiagnosticResult = z.infer<typeof diagnosticResultSchema>;
export const diagnosticReportSchema = z
  .object({
    version: z.literal(1),
    id: z.uuid(),
    capturedAt: z.iso.datetime(),
    consent: z.literal("selected-report-v1"),
    results: z.array(diagnosticResultSchema).min(1).max(133),
  })
  .strict()
  .refine((r) => new Set(r.results.map((x) => x.id)).size === r.results.length);
export type DiagnosticReport = z.infer<typeof diagnosticReportSchema>;
const permission = new Set(["geoloc", "sensors", "kbd"]);
const basic = new Set([
  "clock",
  "langs",
  "locale",
  "tz",
  "hour",
  "week",
  "fmt",
  "os",
  "browser",
  "screen",
  "win",
  "touch",
  "conn",
  "scheme",
  "motion",
  "gamut",
  "a11y",
  "sysui",
  "display",
  "dnt",
  "cookies",
  "pdf",
  "webdriver",
  "history",
]);
export function probeCategory(id: string) {
  if (id === "exif") return "file";
  if (permission.has(id)) return "permission";
  if (id.startsWith("h_") || id === "wba") return "basic";
  const row = registry.find((r) => r.id === id);
  if (
    row?.group === "Network" ||
    row?.group === "Network exits" ||
    ["trackers", "extwar", "xsite", "etag"].includes(id)
  )
    return id === "clock" ? "basic" : "network";
  return basic.has(id) ? "basic" : "advanced";
}
export class ProbeUnavailable extends Error {
  status: DiagnosticStatus;
  constructor(status: DiagnosticStatus, detail?: string) {
    super(detail);
    this.status = status;
  }
}
export function required<T>(value: T | null | undefined): T {
  if (value == null)
    throw new ProbeUnavailable("unsupported", "api_unavailable");
  return value;
}
export function optionalAPI<T>(object: object, key: string): T | undefined {
  return Reflect.get(object, key) as T | undefined;
}

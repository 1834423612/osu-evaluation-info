import { requestNetwork } from "../user-data/network.ts";
import type { DiagnosticResult, DiagnosticValue } from "./protocol.ts";
const headerFields: Record<string, string> = {
  h_ua: "user-agent",
  h_lang: "accept-language",
  h_chua: "sec-ch-ua",
  h_plat: "sec-ch-ua-platform",
  h_enc: "accept-encoding",
};
const edgeIds = new Set([
  "geo",
  "coords",
  "isp",
  "tor",
  "dns",
  "tzip",
  "ptr",
  "edge",
  "proto",
  "kex",
  "warp",
  "tlsfp",
  "tcpfp",
  "ja4",
  "h2fp",
  "quicfp",
]);
export function diagnosticContext(
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env,
) {
  const results: DiagnosticResult[] = [];
  const add = (
    id: string,
    value: DiagnosticValue | undefined,
    source: DiagnosticResult["source"] = "server",
  ) =>
    results.push({
      id,
      source,
      status: value == null ? "unsupported" : "available",
      ...(value == null ? {} : { value }),
      duration: 0,
    });
  for (const [id, name] of Object.entries(headerFields))
    add(id, headers.get(name)?.slice(0, 4096));
  add("h_dnt", { dnt: headers.get("dnt"), gpc: headers.get("sec-gpc") });
  let referrer: string | null = null;
  try {
    const url = new URL(headers.get("referer") ?? "");
    referrer = url.origin;
  } catch {
    /* No referrer. */
  }
  add("h_ref", referrer);
  add("wba", {
    present: headers.has("signature"),
    agent: headers.get("signature-agent")?.slice(0, 512) ?? null,
    verified: false,
  });
  const network = requestNetwork(headers, env);
  results.push({
    id: "ip",
    source: "trusted_proxy",
    status: network.address
      ? "available"
      : network.source === "not_configured"
        ? "not_configured"
        : "unsupported",
    ...(network.address ? { value: network.address } : {}),
    duration: 0,
  });
  // These names are an operator contract: the ingress must remove caller-supplied values and overwrite them.
  // No Cloudflare/TLS information is guessed from the origin connection or arbitrary X-Forwarded-* headers.
  let mapping: Record<string, string> = {};
  try {
    const raw: unknown = JSON.parse(env.DIAGNOSTICS_TRUSTED_HEADERS ?? "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw))
      mapping = raw as Record<string, string>;
  } catch {
    /* Invalid configuration exposes no metadata. */
  }
  for (const id of edgeIds) {
    const name = mapping[id];
    const valid =
      typeof name === "string" && /^x-diagnostic-[a-z0-9-]+$/.test(name);
    const value = valid ? headers.get(name)?.slice(0, 4096) : undefined;
    results.push({
      id,
      source: "trusted_proxy",
      status: value ? "available" : valid ? "unsupported" : "not_configured",
      ...(value ? { value } : {}),
      duration: 0,
    });
  }
  const probes: Record<string, string> = {};
  try {
    const raw: unknown = JSON.parse(env.DIAGNOSTICS_PROBE_PATHS ?? "{}");
    if (raw && typeof raw === "object" && !Array.isArray(raw))
      for (const [id, path] of Object.entries(raw)) {
        // Dedicated same-origin reverse-proxy paths only. No request-supplied URL, external fallback, or credentials.
        if (
          typeof path === "string" &&
          /^\/diagnostic-probes\/[a-z0-9/_-]{1,160}$/.test(path) &&
          [
            "tor",
            "dns",
            "ptr",
            "tlsfp",
            "tcpfp",
            "ja4",
            "h2fp",
            "quicfp",
            "webrtc",
            "ex_cn",
            "ex_intl",
            "ex_gpt",
            "ex_claude",
            "ex_cf",
            "stack",
            "trackers",
            "extwar",
            "xsite",
          ].includes(id)
        )
          probes[id] = path;
      }
  } catch {
    /* Invalid configuration leaves probes unavailable. */
  }
  return { version: 1, serverTime: new Date().toISOString(), results, probes };
}

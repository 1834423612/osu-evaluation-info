import { lookupPublicNetwork } from "../telemetry/network.ts";
import {
  registry,
  probeCategory,
  boundedValue,
  ProbeUnavailable,
  type DiagnosticResult,
} from "./protocol.ts";
import { browserProbes, permissionProbe } from "./probes/browser.ts";
import { asyncProbes } from "./probes/async.ts";
const heuristic = new Set([
  "vm",
  "engine",
  "engver",
  "lies",
  "smooth",
  "emoji",
  "fonts",
  "fontfp",
  "fpid",
  "hwid",
  "rand",
  "adsp",
  "shield",
  "adblock",
  "auto",
  "ext",
  "v6mac",
]);
export async function runProbe(
  id: string,
  signal: AbortSignal,
): Promise<DiagnosticResult> {
  const started = performance.now();
  try {
    signal.throwIfAborted();
    const fn = asyncProbes[id] ?? browserProbes[id];
    if (!fn && !["geoloc", "sensors"].includes(id))
      throw new ProbeUnavailable(
        "not_configured",
        "probe_infrastructure_required",
      );
    const controller = new AbortController(),
      abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new ProbeUnavailable("timed_out")),
      id === "geoloc" ? 9000 : 6000,
    );
    let value: unknown;
    try {
      value = await Promise.race([
        ["geoloc", "sensors", "kbd"].includes(id)
          ? permissionProbe(id, controller.signal)
          : fn(controller.signal),
        new Promise((_, reject) =>
          controller.signal.addEventListener(
            "abort",
            () =>
              reject(
                controller.signal.reason ??
                  new DOMException("Aborted", "AbortError"),
              ),
            { once: true },
          ),
        ),
      ]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      controller.abort();
    }
    signal.throwIfAborted();
    // Native API objects have prototype getters; normalize only explicitly chosen fields in the probe.
    const normalized = JSON.parse(JSON.stringify(value));
    if (!boundedValue(normalized))
      throw new ProbeUnavailable("failed", "result_budget_exceeded");
    return {
      id,
      status: "available",
      source: heuristic.has(id) ? "heuristic" : "browser",
      value: normalized,
      duration: Math.round(performance.now() - started),
    };
  } catch (e) {
    if (signal.aborted) throw e;
    return {
      id,
      status:
        e instanceof ProbeUnavailable
          ? e.status
          : e instanceof DOMException &&
              (e.name === "NotAllowedError" || e.name === "SecurityError")
            ? "denied"
            : "failed",
      source: "browser",
      detail:
        e instanceof ProbeUnavailable
          ? e.message.slice(0, 160)
          : "probe_unavailable",
      duration: Math.round(performance.now() - started),
    };
  }
}
export async function runDiagnostics(
  options: { advanced: boolean; network: boolean },
  signal: AbortSignal,
  onResult: (r: DiagnosticResult) => void,
) {
  let context: DiagnosticResult[] = [],
    probes: Record<string, string> = {};
  try {
    const r = await fetch("/api/diagnostics/context", {
      signal,
      cache: "no-store",
    });
    if (r.ok) {
      const data = await r.json();
      context = data.results;
      probes = data.probes ?? {};
    }
  } catch {
    signal.throwIfAborted();
  }
  if (
    options.network &&
    !context.some((row) => row.id === "ip" && row.status === "available")
  ) {
    const network = await lookupPublicNetwork(fetch, signal);
    if (network) {
      const replacements: Record<string, string | undefined> = {
        ip: network.ip,
        geo: [network.city, network.region, network.country]
          .filter(Boolean)
          .join(" · "),
        isp: network.organization,
      };
      for (const [id, value] of Object.entries(replacements))
        if (value) {
          context = context.filter((row) => row.id !== id);
          context.push({
            id,
            status: "available",
            source: "browser",
            value,
            duration: 0,
            detail: "Public IP API: " + network.source + " (browser reported)",
          });
        }
    } else {
      context = context.map((row) =>
        ["ip", "geo", "isp"].includes(row.id) && row.status !== "available"
          ? {
              ...row,
              status: "unsupported" as const,
              source: "browser" as const,
              detail: "Public IP providers unavailable",
            }
          : row,
      );
    }
  }
  for (const row of registry) {
    signal.throwIfAborted();
    const category = probeCategory(row.id),
      enabled =
        category === "basic" ||
        (category === "advanced" && options.advanced) ||
        (category === "network" && options.network);
    let result: DiagnosticResult;
    if (!enabled || row.id === "agent")
      result = {
        id: row.id,
        status: "not_run",
        source: "browser",
        duration: 0,
      };
    else {
      const server = context.find((x) => x.id === row.id);
      if (probes[row.id] && (!server || server.status !== "available")) {
        try {
          const r = await fetch(probes[row.id], {
            signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            referrerPolicy: "no-referrer",
          });
          if (!r.ok) throw Error();
          const reader = r.body?.getReader();
          if (!reader) throw Error();
          let size = 0;
          const chunks: Uint8Array[] = [];
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > 16384) {
                await reader.cancel();
                throw Error();
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          const bytes = new Uint8Array(size);
          let at = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, at);
            at += chunk.length;
          }
          const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
          if (!boundedValue(value)) throw Error();
          result = {
            id: row.id,
            status: "available",
            source: "configured_probe",
            value,
            duration: 0,
          };
        } catch (e) {
          signal.throwIfAborted();
          result = {
            id: row.id,
            status:
              e instanceof DOMException && e.name === "TimeoutError"
                ? "timed_out"
                : "failed",
            source: "configured_probe",
            detail: "probe_unreachable_or_invalid",
            duration: 0,
          };
        }
      } else if (server) result = server;
      else if (row.id === "v6mac") {
        const ip = context.find((x) => x.id === "ip")?.value;
        result = {
          id: row.id,
          status: typeof ip === "string" ? "available" : "unsupported",
          source: "heuristic",
          ...(typeof ip === "string"
            ? {
                value: {
                  eui64Pattern: ip.includes(":") && /ff:fe/i.test(ip),
                  conclusive: false,
                },
              }
            : {}),
          duration: 0,
        };
      } else result = await runProbe(row.id, signal);
    }
    onResult(result);
    // Yield between bounded probes so controls and scrolling stay responsive.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

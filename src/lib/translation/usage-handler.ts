import { createHash } from "node:crypto";
import { readJsonLimited, withDeadline } from "./http.ts";
import type { TranslationObservation } from "./gateway.ts";

/** Client reports are untrusted approximate metrics, never provider health signals. */
export function createTranslationUsageHandler(
  observe: (event: TranslationObservation) => void,
  now = Date.now,
) {
  const rates = new Map<string, { start: number; count: number }>();
  return async (request: Request) => {
    const address =
      request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "local";
    const key = createHash("sha256")
      .update(address.slice(0, 128))
      .digest("hex");
    const previous = rates.get(key);
    const rate =
      previous && now() - previous.start < 60_000
        ? previous
        : { start: now(), count: 0 };
    rates.set(key, rate);
    while (rates.size > 2048) rates.delete(rates.keys().next().value!);
    const response = (status: number) =>
      new Response(null, {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
      });
    if (++rate.count > 120) return response(429);
    try {
      const body = (await withDeadline(
        (signal) => readJsonLimited(request, 8 * 1024, signal),
        1000,
      )) as { events?: unknown };
      const events = body?.events;
      if (!Array.isArray(events) || !events.length || events.length > 32)
        return response(400);
      const valid = events.every(
        (event) =>
          event &&
          typeof event === "object" &&
          Object.keys(event).every((key) =>
            [
              "provider",
              "target",
              "outcome",
              "characters",
              "durationMs",
            ].includes(key),
          ) &&
          ["dict-chrome-ex", "clients5", "gtx"].includes(event.provider) &&
          ["en", "zh-CN"].includes(event.target) &&
          ["success", "failure", "timeout", "busy", "circuit"].includes(
            event.outcome,
          ) &&
          Number.isInteger(event.characters) &&
          event.characters >= 0 &&
          event.characters <= 4000 &&
          Number.isInteger(event.durationMs) &&
          event.durationMs >= 0 &&
          event.durationMs <= 60_000,
      );
      if (!valid) return response(400);
      if (rate.count + events.length - 1 > 120) return response(429);
      rate.count += events.length - 1;
      for (const event of events) observe(event);
      return response(204);
    } catch {
      return response(400);
    }
  };
}

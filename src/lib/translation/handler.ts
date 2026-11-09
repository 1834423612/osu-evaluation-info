import { createHash } from "node:crypto";
import { readJsonLimited, withDeadline } from "./http.ts";
import {
  parseTranslationBatch,
  BROWSER_TRANSLATION_PROVIDERS,
  type TranslationItem,
  type TranslationResult,
  type TranslationRequestOptions,
} from "./service.ts";

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

/** Validate and rate-limit legacy or batch requests before invoking server translation. */
export function createTranslationHandler(
  translateBatch: (
    items: TranslationItem[],
    options?: TranslationRequestOptions,
  ) => Promise<TranslationResult[]>,
  now = Date.now,
) {
  const requests = new Map<string, { start: number; count: number }>();
  function allow(key: string, cost: number) {
    const time = now();
    const current = requests.get(key);
    if (!current || time - current.start >= 60_000)
      requests.set(key, { start: time, count: cost });
    else {
      if (current.count + cost > 30) return false;
      current.count += cost;
    }
    while (requests.size > 2048) requests.delete(requests.keys().next().value!);
    return true;
  }
  return async function POST(request: Request) {
    // Deployment proxies must overwrite these headers with the trusted client address.
    const address =
      request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "local";
    const key = createHash("sha256")
      .update(address.slice(0, 128))
      .digest("hex");
    if (!allow(key, 1))
      return response(
        { error: "Please wait before translating more text." },
        429,
      );
    let payload: unknown;
    try {
      payload = await withDeadline(
        (signal) => readJsonLimited(request, 48 * 1024, signal),
        3000,
      );
    } catch {
      return response(
        { error: "A valid translation request is required." },
        400,
      );
    }
    const items = parseTranslationBatch(payload);
    const mode = (payload as { mode?: unknown } | null)?.mode ?? "auto";
    if (!items || (mode !== "auto" && mode !== "ollama"))
      return response(
        { error: "Valid text and target languages are required." },
        400,
      );
    if (!allow(key, items.length - 1))
      return response(
        { error: "Please wait before translating more text." },
        429,
      );
    try {
      const results = await translateBatch(items, { mode });
      const legacy = !(payload as { items?: unknown }).items;
      if (legacy) {
        const result = results[0];
        return result?.status === "translated"
          ? response(result)
          : response(
              {
                ...result,
                error: "Translation is temporarily unavailable.",
                browserFallback: BROWSER_TRANSLATION_PROVIDERS,
              },
              503,
            );
      }
      // Item failures remain independent; a failed NAS request cannot discard good siblings.
      return response({
        version: 1,
        results,
        browserFallback: BROWSER_TRANSLATION_PROVIDERS,
      });
    } catch {
      return response(
        { error: "Translation is temporarily unavailable." },
        503,
      );
    }
  };
}

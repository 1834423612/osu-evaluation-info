import {
  MAX_TRANSLATION_RESPONSE_BYTES,
  parseTranslationResponse,
  validTranslationResult,
  type TranslationItem,
} from "./service.ts";
import { readJsonLimited } from "./http.ts";
import { TranslationProviderError } from "./provider-error.ts";

export type ServerTranslationProvider = "ollama";
export type TranslationNode = {
  id: ServerTranslationProvider;
  timeoutMs: number;
  slowMs: number;
  concurrency: number;
  cooldownMs: number;
  translate: (item: TranslationItem, signal: AbortSignal) => Promise<string>;
};

/** Fall back to bounded defaults when an optional environment policy is invalid. */
function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

/** Request translation text only, with an explicit English or Simplified Chinese target. */
export function translationPrompt(
  text: string,
  target: TranslationItem["target"],
) {
  return `将以下文本翻译为${target === "en" ? "英文" : "简体中文"}，注意只需要输出翻译后的结果，不要额外解释：\n\n${text}`;
}

/** Only this server-side adapter reads NAS configuration or attaches Access credentials. */
export function createTranslationProviders(
  environment: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): TranslationNode[] {
  const nodes: TranslationNode[] = [];
  const base = environment.KJCH_AI_SERVICES_API_URL?.trim();
  const clientId = environment.KJCH_AI_SERVICES_CF_CLIENT_ID?.trim();
  const clientSecret = environment.KJCH_AI_SERVICES_CF_CLIENT_SECRET?.trim();
  if (base && Boolean(clientId) === Boolean(clientSecret)) {
    try {
      const url = new URL(base);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        (url.protocol === "http:" && Boolean(clientId)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("Invalid translation endpoint.");
      url.pathname = `${url.pathname.replace(/\/$/, "").replace(/\/api\/generate$/, "")}/api/generate`;
      nodes.push({
        id: "ollama",
        timeoutMs: integer(
          environment.KJCH_AI_SERVICES_TIMEOUT_MS,
          6000,
          500,
          8000,
        ),
        slowMs: integer(environment.KJCH_AI_SERVICES_SLOW_MS, 2500, 250, 8000),
        concurrency: integer(
          environment.KJCH_AI_SERVICES_MAX_CONCURRENCY,
          1,
          1,
          8,
        ),
        cooldownMs: integer(
          environment.KJCH_AI_SERVICES_COOLDOWN_MS,
          30000,
          1000,
          300000,
        ),
        async translate(item, signal) {
          const response = await fetcher(url, {
            method: "POST",
            cache: "no-store",
            redirect: "manual",
            signal,
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(clientId && clientSecret
                ? {
                    "CF-Access-Client-Id": clientId,
                    "CF-Access-Client-Secret": clientSecret,
                  }
                : {}),
            },
            body: JSON.stringify({
              model:
                environment.KJCH_AI_SERVICES_MODEL?.trim() ||
                "HY-MT1.5-1.8B-GGUF:Q4_K_M",
              prompt: translationPrompt(item.text, item.target),
              stream: false,
              keep_alive: "10m",
              options: { temperature: 0.2, num_predict: 2048 },
            }),
          });
          return parseResponse(response, "ollama", item, signal);
        },
      });
    } catch {
      // Missing/invalid NAS configuration leaves browser fallback available.
    }
  }

  return nodes;
}

/** Classify safe upstream failures and reject incomplete or oversized model output. */
async function parseResponse(
  response: Response,
  provider: ServerTranslationProvider,
  item: TranslationItem,
  signal: AbortSignal,
) {
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    const location = response.headers.get("location") ?? "";
    const loginRedirect = /cloudflareaccess\.com|\/cdn-cgi\/access\//i.test(
      location,
    );
    const reason =
      response.status === 401 || response.status === 403 || loginRedirect
        ? "auth"
        : response.status === 429
          ? "rate_limit"
          : "http";
    const header = response.headers.get("retry-after");
    const seconds = Number(header);
    const retryAfterMs = header?.trim()
      ? Number.isFinite(seconds)
        ? seconds * 1000
        : Date.parse(header) - Date.now()
      : NaN;
    throw new TranslationProviderError(
      reason,
      response.status,
      response.status === 429 && Number.isFinite(retryAfterMs)
        ? Math.min(300000, Math.max(1000, retryAfterMs))
        : undefined,
    );
  }
  let payload: unknown;
  try {
    payload = await readJsonLimited(
      response,
      MAX_TRANSLATION_RESPONSE_BYTES,
      signal,
    );
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new TranslationProviderError("invalid_response");
  }
  const result = parseTranslationResponse(payload, provider, item.text);
  if (!result || !validTranslationResult(result, item.text, item.target))
    throw new TranslationProviderError("invalid_response");
  return result;
}

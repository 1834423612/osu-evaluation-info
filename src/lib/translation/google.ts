import { readJsonLimited, withDeadline } from "./http.ts";
import type { TranslationObservation } from "./gateway.ts";
import {
  BROWSER_TRANSLATION_PROVIDERS,
  MAX_TRANSLATION_RESPONSE_BYTES,
  parseTranslationResponse,
  parseTranslationBatch,
  validTranslationResult,
  TranslationUnavailableError,
  type TranslationItem,
  type TranslationResult,
} from "./service.ts";

/** One independent set of cooldowns per user's page. Never used by the API server. */
export function createBrowserGoogleFallback(
  fetcher: typeof fetch = fetch,
  now = Date.now,
  observe: (event: TranslationObservation) => void = () => undefined,
) {
  const states = BROWSER_TRANSLATION_PROVIDERS.map((provider) => ({
    ...provider,
    retryAt: 0,
    failures: 0,
    active: 0,
  }));
  return async function translate(
    item: TranslationItem,
    plan: unknown = BROWSER_TRANSLATION_PROVIDERS,
  ): Promise<Extract<TranslationResult, { status: "translated" }>> {
    if (!parseTranslationBatch({ items: [item] }))
      throw new TranslationUnavailableError();
    const started = now();
    // Use canonical endpoints even if a malformed server response supplies arbitrary URLs.
    const allowed = Array.isArray(plan)
      ? plan.flatMap((entry) => {
          const node = states.find(
            ({ id, endpoint }) =>
              entry?.id === id && entry?.endpoint === endpoint,
          );
          return node ? [node] : [];
        })
      : [];
    const candidates = allowed.length ? [...new Set(allowed)] : states;
    for (const state of candidates) {
      const attemptStarted = now();
      const report = (outcome: TranslationObservation["outcome"]) =>
        observe({
          provider: state.id,
          target: item.target,
          outcome,
          characters: item.text.length,
          durationMs: Math.max(0, now() - attemptStarted),
        });
      if (
        state.retryAt > now() ||
        state.active >= 2 ||
        (state.retryAt > 0 && state.active > 0)
      ) {
        report(state.retryAt > now() ? "circuit" : "busy");
        continue;
      }
      state.active++;
      let cooldownMs = 5000;
      try {
        const translation = await withDeadline(async (signal) => {
          const url = new URL(state.endpoint);
          url.searchParams.set(
            "client",
            state.id === "gtx" ? "gtx" : "dict-chrome-ex",
          );
          url.searchParams.set("sl", "auto");
          url.searchParams.set("tl", item.target);
          url.searchParams.set("q", item.text);
          if (state.id === "gtx") url.searchParams.set("dt", "t");
          const response = await fetcher(url, {
            method: "GET",
            mode: "cors",
            credentials: "omit",
            referrerPolicy: "no-referrer",
            cache: "no-store",
            redirect: "error",
            signal,
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            if (response.status === 429) {
              const value = response.headers.get("retry-after");
              const seconds = Number(value);
              const duration =
                value && Number.isFinite(seconds)
                  ? seconds * 1000
                  : Date.parse(value ?? "") - now();
              cooldownMs = Math.min(
                60_000,
                Math.max(5000, Number.isFinite(duration) ? duration : 30_000),
              );
            }
            void response.body?.cancel().catch(() => undefined);
            throw new TranslationUnavailableError(cooldownMs);
          }
          const payload = await readJsonLimited(
            response,
            MAX_TRANSLATION_RESPONSE_BYTES,
            signal,
          );
          const value = parseTranslationResponse(payload, state.id, item.text);
          if (!value || !validTranslationResult(value, item.text, item.target))
            throw new TranslationUnavailableError();
          return value;
        }, 2500);
        state.retryAt = 0;
        state.failures = 0;
        report("success");
        return {
          id: item.id,
          target: item.target,
          status: "translated",
          translation,
          provider: state.id,
          cache: "miss",
          durationMs: Math.max(0, now() - started),
        };
      } catch (error) {
        state.failures++;
        state.retryAt =
          now() +
          Math.min(
            60_000,
            Math.max(cooldownMs, 5000 * 2 ** Math.min(state.failures - 1, 3)),
          );
        report(
          error instanceof Error && error.name === "TimeoutError"
            ? "timeout"
            : "failure",
        );
      } finally {
        state.active--;
      }
    }
    throw new TranslationUnavailableError(
      Math.min(
        ...candidates.map(({ retryAt }) => Math.max(1000, retryAt - now())),
      ),
    );
  };
}

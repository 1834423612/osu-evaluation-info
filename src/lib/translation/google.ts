import { readJsonLimited, withDeadline } from "./http.ts";
import type { TranslationObservation } from "./gateway.ts";
import { createMemoryTranslationState } from "./state-store.ts";
import { TranslationProviderError } from "./provider-error.ts";
import { translationIdentifier } from "./identifier.ts";
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

/** The shared health machine runs independently inside each user's page. */
export function createBrowserGoogleFallback(
  fetcher: typeof fetch = fetch,
  now = Date.now,
  observe: (event: TranslationObservation) => void = () => undefined,
) {
  const state = createMemoryTranslationState(now);
  const sessionId = translationIdentifier();
  let sequence = 0;
  const ready = Promise.all(
    BROWSER_TRANSLATION_PROVIDERS.map((node) =>
      state.register({
        id: node.id,
        configured: true,
        configHash: node.endpoint,
        policy: {
          timeoutMs: 2500,
          slowMs: 2000,
          concurrency: 2,
          cooldownMs: 5000,
        },
      }),
    ),
  );
  return async function translate(
    item: TranslationItem,
    plan: unknown = BROWSER_TRANSLATION_PROVIDERS,
  ): Promise<Extract<TranslationResult, { status: "translated" }>> {
    if (!parseTranslationBatch({ items: [item] }))
      throw new TranslationUnavailableError();
    await ready;
    const started = now();
    const allowed = Array.isArray(plan)
      ? plan.flatMap((entry) => {
          const node = BROWSER_TRANSLATION_PROVIDERS.find(
            ({ id, endpoint }) =>
              entry?.id === id && entry?.endpoint === endpoint,
          );
          return node ? [node] : [];
        })
      : [];
    const candidates = allowed.length
      ? [...new Set(allowed)]
      : BROWSER_TRANSLATION_PROVIDERS;
    let retryAfterMs = 60000;
    for (const node of candidates) {
      const attemptStarted = now();
      const ticket = translationIdentifier();
      const report = (outcome: TranslationObservation["outcome"]) => {
        const health = state.snapshot(node.id).health;
        observe({
          provider: node.id,
          target: item.target,
          outcome,
          characters: item.text.length,
          durationMs: Math.max(0, now() - attemptStarted),
          browser: {
            sessionId,
            sequence: ++sequence,
            phase: health.phase,
            reason: health.reason,
            consecutiveFailures: health.consecutiveFailures,
            retryAfterMs: Math.max(0, (health.nextRetryAt ?? now()) - now()),
          },
        });
      };
      const decision = await state.claim(
        node.id,
        ticket,
        item.target,
        item.text.length,
      );
      if (!decision.allowed) {
        retryAfterMs = Math.min(retryAfterMs, decision.retryAfterMs);
        report(decision.availability === "busy" ? "busy" : "circuit");
        continue;
      }
      let settled = false,
        finalized = false;
      const onSettled = () => {
        settled = true;
        if (finalized) void state.release(node.id, ticket);
      };
      try {
        const translation = await withDeadline((signal) => {
          const operation = (async () => {
            const url = new URL(node.endpoint);
            url.searchParams.set(
              "client",
              node.id === "gtx" ? "gtx" : "dict-chrome-ex",
            );
            url.searchParams.set("sl", "auto");
            url.searchParams.set("tl", item.target);
            url.searchParams.set("q", item.text);
            if (node.id === "gtx") url.searchParams.set("dt", "t");
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
              void response.body?.cancel().catch(() => undefined);
              const header = response.headers.get("retry-after");
              const seconds = Number(header);
              const duration =
                header && Number.isFinite(seconds)
                  ? seconds * 1000
                  : Date.parse(header ?? "") - now();
              throw new TranslationProviderError(
                response.status === 429 ? "rate_limit" : "http",
                response.status,
                response.status === 429
                  ? Math.min(
                      60000,
                      Math.max(
                        5000,
                        Number.isFinite(duration) ? duration : 30000,
                      ),
                    )
                  : undefined,
              );
            }
            const payload = await readJsonLimited(
              response,
              MAX_TRANSLATION_RESPONSE_BYTES,
              signal,
            );
            const text = parseTranslationResponse(payload, node.id, item.text);
            if (!text || !validTranslationResult(text, item.text, item.target))
              throw new TranslationProviderError("invalid_response");
            return text;
          })();
          void operation.then(onSettled, onSettled);
          return operation;
        }, decision.policy.timeoutMs);
        const accepted = await state.finish(
          node.id,
          ticket,
          {
            success: true,
            reason: "success",
            durationMs: now() - attemptStarted,
            httpStatus: 200,
          },
          true,
        );
        if (!accepted) {
          retryAfterMs = 1000;
          report("timeout");
          continue;
        }
        report("success");
        return {
          id: item.id,
          target: item.target,
          status: "translated",
          translation,
          provider: node.id,
          cache: "miss",
          durationMs: Math.max(0, now() - started),
        };
      } catch (error) {
        const timeout = error instanceof Error && error.name === "TimeoutError";
        await state.finish(
          node.id,
          ticket,
          {
            success: false,
            reason: timeout
              ? "timeout"
              : error instanceof TranslationProviderError
                ? error.kind
                : "network",
            durationMs: Math.max(0, now() - attemptStarted),
            httpStatus:
              error instanceof TranslationProviderError
                ? error.httpStatus
                : undefined,
            retryAfterMs:
              error instanceof TranslationProviderError
                ? error.retryAfterMs
                : undefined,
          },
          settled,
        );
        const health = state.snapshot(node.id).health;
        retryAfterMs = Math.min(
          retryAfterMs,
          Math.max(1000, (health.nextRetryAt ?? now()) - now()),
        );
        report(timeout ? "timeout" : "failure");
      } finally {
        finalized = true;
        if (settled) await state.release(node.id, ticket);
      }
    }
    throw new TranslationUnavailableError(retryAfterMs);
  };
}

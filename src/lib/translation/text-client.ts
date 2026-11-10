import { translateInBrowser } from "./browser.ts";
import { debugServiceValue } from "../debug/services.ts";
import { createRemoteTranslationClient } from "./client.ts";
import { createBrowserUsageReporter } from "./browser-usage.ts";
import { createTranslationScheduler } from "./scheduler.ts";
import type { TranslationCallbacks } from "./consumers.ts";
import {
  translationLanguagePair,
  TranslationUnavailableError,
  type TranslationModel,
  type TranslationProvider,
  type TranslationTarget,
} from "./service.ts";

export type DisplayTranslation = {
  translation: string;
  provider: TranslationProvider;
};
const scheduler = createTranslationScheduler<DisplayTranslation>(4);
const remote = createRemoteTranslationClient(
  (...args) => fetch(...args),
  25,
  createBrowserUsageReporter(),
);
export function translationCacheKey(
  source: string,
  target: TranslationTarget,
  model: TranslationModel,
) {
  return `${model}\0${target}\0${source}`;
}

/** Snippets and word clouds share model routing, bounded work, and per-word results. */
export function requestTextTranslation(
  source: string,
  model: TranslationModel,
  manual: boolean,
  callbacks: TranslationCallbacks = {},
) {
  const pair = translationLanguagePair(source);
  return debugServiceValue(
    "translation",
    translationCacheKey(source, pair.targetLanguage, model),
    () =>
      scheduler.request(
        translationCacheKey(source, pair.targetLanguage, model),
        async (consumers) => {
          let result: DisplayTranslation | null = null;
          if (model === "auto" || model === "chrome") {
            try {
              const local = await translateInBrowser(
                source,
                pair.sourceLanguage,
                pair.targetLanguage,
              );
              if (local) result = { translation: local, provider: "chrome" };
            } catch {
              result = null;
            }
          }
          if (!result && model === "chrome")
            throw new TranslationUnavailableError();
          if (!result) {
            if (!consumers.canStart?.())
              throw new DOMException(
                "Translation model changed.",
                "AbortError",
              );
            consumers.onStarted?.();
            result = await remote.request(
              source,
              pair.targetLanguage,
              model === "chrome" ? "auto" : model,
              consumers,
            );
          }
          return { translation: result.translation, provider: result.provider };
        },
        manual,
        callbacks,
      ),
  );
}

import { validTranslationResult, type TranslationTarget } from "./service.ts";

export type TranslatorInstance = {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?: () => void;
};
export type TranslatorConstructor = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<string>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
    signal?: AbortSignal;
  }): Promise<TranslatorInstance>;
};
export type BrowserTranslationAvailability =
  "unsupported" | "unavailable" | "downloadable" | "downloading" | "available";
export type ModelDownloadProgress = {
  fraction: number | null;
  totalBytes: number | null;
  loadedBytes: number | null;
};

declare global {
  interface Window {
    Translator?: TranslatorConstructor;
  }
}

export function browserTranslator() {
  if (typeof window === "undefined" || !window.isSecureContext)
    return undefined;
  const translator = window.Translator;
  return typeof translator?.availability === "function" &&
    typeof translator.create === "function"
    ? translator
    : undefined;
}

export function browserLanguagePair(
  sourceLanguage: "en" | "zh",
  targetLanguage: TranslationTarget,
) {
  return {
    sourceLanguage,
    targetLanguage: targetLanguage === "zh-CN" ? "zh" : "en",
  };
}

/** Probe support without creating a translator or initiating any download. */
export async function browserTranslationAvailability(
  sourceLanguage: "en" | "zh",
  targetLanguage: TranslationTarget,
  translator: TranslatorConstructor | undefined = browserTranslator(),
): Promise<BrowserTranslationAvailability> {
  if (!translator) return "unsupported";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      translator.availability(
        browserLanguagePair(sourceLanguage, targetLanguage),
      ),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve("unavailable"), 3000);
      }),
    ]);
    return ["available", "downloadable", "downloading"].includes(value)
      ? (value as BrowserTranslationAvailability)
      : "unavailable";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}

/** Chrome reports normalized progress; only a real byte total is a model size. */
export function modelDownloadProgress(event: Event): ModelDownloadProgress {
  const { loaded, total } = event as ProgressEvent;
  if (
    Number.isFinite(total) &&
    total > 1 &&
    Number.isFinite(loaded) &&
    loaded >= 0 &&
    loaded <= total
  )
    return { fraction: loaded / total, totalBytes: total, loadedBytes: loaded };
  return {
    fraction:
      Number.isFinite(loaded) && loaded >= 0 && loaded <= 1 ? loaded : null,
    totalBytes: null,
    loadedBytes: null,
  };
}

/** Called directly from the confirmation gesture, before yielding user activation. */
export async function downloadBrowserTranslationModel(
  sourceLanguage: "en" | "zh",
  targetLanguage: TranslationTarget,
  onProgress: (progress: ModelDownloadProgress) => void,
  signal: AbortSignal,
  translator: TranslatorConstructor | undefined = browserTranslator(),
  timeoutMs = 180_000,
) {
  if (!translator) throw new Error("On-device translation is unavailable.");
  signal.throwIfAborted();
  const controller = new AbortController();
  let instance: TranslatorInstance | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => {
        controller.abort();
        reject(new DOMException("Model download cancelled.", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("Model download timed out."));
      }, timeoutMs);
    });
    const request = translator.create({
      ...browserLanguagePair(sourceLanguage, targetLanguage),
      signal: controller.signal,
      monitor: (monitor) =>
        monitor.addEventListener("downloadprogress", (event) => {
          if (!controller.signal.aborted)
            onProgress(modelDownloadProgress(event));
        }),
    });
    void request.then(
      (created) => {
        if (controller.signal.aborted) created.destroy?.();
      },
      () => undefined,
    );
    instance = await Promise.race([request, cancelled]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    controller.abort();
    instance?.destroy?.();
  }
}

/** Translation only uses a ready model. Downloads have their own explicit consent flow. */
export async function translateInBrowser(
  source: string,
  sourceLanguage: "en" | "zh",
  targetLanguage: TranslationTarget,
  translator: TranslatorConstructor | undefined = browserTranslator(),
  timeoutMs = 12_000,
) {
  if (!translator) return null;
  const controller = new AbortController();
  let instance: TranslatorInstance | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Local translation timed out."));
    }, timeoutMs);
  });
  try {
    const availability = await Promise.race([
      translator.availability(
        browserLanguagePair(sourceLanguage, targetLanguage),
      ),
      deadline,
    ]);
    if (availability !== "available") return null;
    const request = translator.create({
      ...browserLanguagePair(sourceLanguage, targetLanguage),
      signal: controller.signal,
    });
    void request.then(
      (created) => {
        if (controller.signal.aborted) created.destroy?.();
      },
      () => undefined,
    );
    instance = await Promise.race([request, deadline]);
    const result = (
      await Promise.race([
        instance.translate(source, { signal: controller.signal }),
        deadline,
      ])
    ).trim();
    return validTranslationResult(result, source, targetLanguage)
      ? result
      : null;
  } finally {
    clearTimeout(timer);
    controller.abort();
    instance?.destroy?.();
  }
}

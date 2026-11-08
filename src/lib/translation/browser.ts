import { validTranslationResult, type TranslationTarget } from "./service.ts";

type TranslatorInstance = {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?: () => void;
};
type TranslatorConstructor = {
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

declare global {
  interface Window {
    Translator?: TranslatorConstructor;
  }
}

export async function translateInBrowser(
  source: string,
  sourceLanguage: "en" | "zh",
  targetLanguage: TranslationTarget,
  onDownload: () => void,
  allowDownload: boolean,
  translator: TranslatorConstructor | undefined = window.Translator,
  timeoutMs = 12_000,
) {
  if (!translator) return null;
  const controller = new AbortController();
  let instance: TranslatorInstance | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Local translation timed out."));
    }, timeoutMs);
  });
  const target = targetLanguage === "zh-CN" ? "zh" : "en";
  try {
    const availabilityRequest = translator.availability({
      sourceLanguage,
      targetLanguage: target,
    });
    if (!allowDownload) {
      const availability = await Promise.race([availabilityRequest, deadline]);
      // Automatic translation must never initiate a language-model download.
      if (availability !== "available") return null;
    }
    const instanceRequest = translator.create({
      sourceLanguage,
      targetLanguage: target,
      signal: controller.signal,
      monitor: (monitor) => {
        monitor.addEventListener("downloadprogress", () => {
          if (!controller.signal.aborted) onDownload();
        });
      },
    });
    void instanceRequest.then(
      (created) => {
        if (controller.signal.aborted) created.destroy?.();
      },
      () => undefined,
    );
    const [availability, created] = await Promise.race([
      Promise.all([availabilityRequest, instanceRequest]),
      deadline,
    ]);
    instance = created;
    if (availability === "unavailable") return null;
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
    clearTimeout(timer!);
    controller.abort();
    instance?.destroy?.();
  }
}

export type TranslationTarget = "zh-CN" | "en";
export type GoogleTranslationProvider = "dict-chrome-ex" | "clients5" | "gtx";
export type TranslationProvider =
  "chrome" | "ollama" | GoogleTranslationProvider;
export type TranslationModel = "auto" | "chrome" | "ollama" | "google";
export type TranslationRequestOptions = { mode?: "auto" | "ollama" };
export type TranslationDisplayMode = "bilingual" | "replace";
export type TranslationAction =
  "translate" | "show-translation" | "hide-translation" | "show-original";

export const MAX_TRANSLATION_LENGTH = 4_000;
export const MAX_TRANSLATED_LENGTH = 8_000;
export const MAX_TRANSLATION_RESPONSE_BYTES = 64 * 1024;
export const MAX_TRANSLATION_BATCH_SIZE = 8;
export const MAX_TRANSLATION_BATCH_LENGTH = 12_000;
export const TRANSLATION_DEADLINE_MS = 16_000;
export const TRANSLATION_QUEUE_WAIT_MS = 30_000;

/** Public routing metadata only. Google fetches are performed by the browser. */
export const BROWSER_TRANSLATION_PROVIDERS = [
  {
    id: "dict-chrome-ex",
    endpoint: "https://translate.googleapis.com/translate_a/t",
  },
  { id: "clients5", endpoint: "https://clients5.google.com/translate_a/t" },
  {
    id: "gtx",
    endpoint: "https://translate.googleapis.com/translate_a/single",
  },
] as const;

export type TranslationItem = {
  id: string;
  text: string;
  target: TranslationTarget;
};
export type TranslationResult = {
  id: string;
  target: TranslationTarget;
  durationMs: number;
} & (
  | {
      status: "translated";
      translation: string;
      provider: TranslationProvider;
      cache: "miss" | "hit" | "shared";
    }
  | { status: "unavailable"; retryAfterMs?: number }
);

export function parseTranslationBatch(
  value: unknown,
): TranslationItem[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as { items?: unknown; text?: unknown; target?: unknown };
  const items = body.items === undefined ? [{ ...body, id: "0" }] : body.items;
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > MAX_TRANSLATION_BATCH_SIZE
  )
    return null;
  const ids = new Set<string>();
  const result: TranslationItem[] = [];
  let characters = 0;
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const { id, text, target } = item;
    if (
      typeof id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(id) ||
      ids.has(id) ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_TRANSLATION_LENGTH ||
      (target !== "en" && target !== "zh" && target !== "zh-CN")
    )
      return null;
    characters += text.length;
    if (characters > MAX_TRANSLATION_BATCH_LENGTH) return null;
    ids.add(id);
    result.push({ id, text, target: target === "zh" ? "zh-CN" : target });
  }
  return result;
}

export class TranslationUnavailableError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs = 5000) {
    super("Translation is temporarily unavailable.");
    this.name = "TranslationUnavailableError";
    this.retryAfterMs = Math.min(60_000, Math.max(1000, retryAfterMs));
  }
}

export function translationAction(
  mode: TranslationDisplayMode,
  visible: boolean,
  hasTranslation: boolean,
): TranslationAction {
  if (!hasTranslation) return "translate";
  if (!visible) return "show-translation";
  return mode === "bilingual" ? "hide-translation" : "show-original";
}

export function translationLanguagePair(source: string): {
  sourceLanguage: "en" | "zh";
  targetLanguage: TranslationTarget;
} {
  const chinese = source.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = source.match(/[a-z]/gi)?.length ?? 0;
  return chinese > 0 && chinese >= latin / 4
    ? { sourceLanguage: "zh", targetLanguage: "en" }
    : { sourceLanguage: "en", targetLanguage: "zh-CN" };
}

function appendTextSegments(value: unknown, output: string[], depth = 0) {
  if (depth > 5 || !Array.isArray(value)) return;
  if (typeof value[0] === "string") {
    output.push(value[0]);
    return;
  }
  for (const segment of value.slice(0, 128)) {
    if (Array.isArray(segment)) {
      const translated = segment[0];
      if (typeof translated === "string") output.push(translated);
      else appendTextSegments(segment, output, depth + 1);
    }
  }
}

function translatedTextFromPayload(
  payload: unknown,
  provider: GoogleTranslationProvider,
): string | null {
  if (!Array.isArray(payload)) return null;
  const values: string[] = [];

  if (provider === "gtx") {
    appendTextSegments(payload[0], values);
  } else if (typeof payload[0] === "string") {
    values.push(payload[0]);
  } else if (Array.isArray(payload[0])) {
    appendTextSegments(payload[0], values);
  }

  const translation = values.join("").trim();
  return translation ? translation : null;
}

export function parseTranslationResponse(
  payload: unknown,
  provider: Exclude<TranslationProvider, "chrome">,
  sourceText: string,
): string | null {
  if (sourceText.length > MAX_TRANSLATION_LENGTH) return null;
  let translation: string | null;
  if (provider === "ollama") {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return null;
    const result = payload as {
      response?: unknown;
      done?: unknown;
      done_reason?: unknown;
    };
    if (
      result.done !== true ||
      result.done_reason === "length" ||
      typeof result.response !== "string"
    )
      return null;
    translation = result.response.trim();
  } else {
    translation = translatedTextFromPayload(payload, provider);
  }
  if (
    !translation ||
    translation.length > MAX_TRANSLATED_LENGTH ||
    translation.trim().toLocaleLowerCase() ===
      sourceText.trim().toLocaleLowerCase()
  )
    return null;
  return translation;
}

export function validTranslationResult(
  value: string,
  source: string,
  target: TranslationTarget,
) {
  return Boolean(
    value.trim() &&
    value.length <= MAX_TRANSLATED_LENGTH &&
    value.trim().toLocaleLowerCase() !== source.trim().toLocaleLowerCase() &&
    (target === "zh-CN" ? /\p{Script=Han}/u.test(value) : /[a-z]/i.test(value)),
  );
}

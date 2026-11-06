export type TranslationTarget = "zh-CN" | "en";
export type TranslationProvider = "dict-chrome-ex" | "clients5" | "gtx";
export type TranslationDisplayMode = "bilingual" | "replace";
export type TranslationAction =
  "translate" | "show-translation" | "hide-translation" | "show-original";

export const MAX_TRANSLATION_LENGTH = 4_000;
export const MAX_TRANSLATED_LENGTH = 8_000;
export const MAX_TRANSLATION_RESPONSE_BYTES = 64 * 1024;

export class TranslationUnavailableError extends Error {
  constructor() {
    super("Translation is temporarily unavailable.");
    this.name = "TranslationUnavailableError";
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
  provider: TranslationProvider,
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
  provider: TranslationProvider,
  sourceText: string,
): string | null {
  if (sourceText.length > MAX_TRANSLATION_LENGTH) return null;
  const translation = translatedTextFromPayload(payload, provider);
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

function endpoint(provider: TranslationProvider) {
  if (provider === "clients5")
    return "https://clients5.google.com/translate_a/t";
  if (provider === "gtx")
    return "https://translate.googleapis.com/translate_a/single";
  return "https://translate.googleapis.com/translate_a/t";
}

function providerUrl(
  provider: TranslationProvider,
  target: TranslationTarget,
  sourceText: string,
) {
  const url = new URL(endpoint(provider));
  if (provider === "gtx") {
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", target);
    url.searchParams.set("dt", "t");
  } else {
    url.searchParams.set("client", "dict-chrome-ex");
    url.searchParams.set("sl", "auto");
    url.searchParams.set("tl", target);
  }
  url.searchParams.set("q", sourceText);
  return url;
}

async function readJsonLimited(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json"))
    throw new TranslationUnavailableError();
  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_TRANSLATION_RESPONSE_BYTES
  )
    throw new TranslationUnavailableError();
  const reader = response.body?.getReader();
  if (!reader) throw new TranslationUnavailableError();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TRANSLATION_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TranslationUnavailableError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new TranslationUnavailableError();
  }
}

export async function translateWithFallback(
  sourceText: string,
  target: TranslationTarget,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (
    !sourceText.trim() ||
    sourceText.length > MAX_TRANSLATION_LENGTH ||
    !["en", "zh-CN"].includes(target)
  )
    throw new TranslationUnavailableError();

  const providers: TranslationProvider[] = [
    "dict-chrome-ex",
    "clients5",
    "gtx",
  ];
  for (const provider of providers) {
    try {
      const response = await fetcher(
        providerUrl(provider, target, sourceText),
        {
          method: "GET",
          cache: "no-store",
          redirect: "error",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(4_000),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      const payload = await readJsonLimited(response);
      const translation = parseTranslationResponse(
        payload,
        provider,
        sourceText,
      );
      if (
        translation &&
        validTranslationResult(translation, sourceText, target)
      )
        return translation;
    } catch {
      // Upstream endpoints are best-effort and may reject or rate-limit traffic.
    }
  }
  throw new TranslationUnavailableError();
}

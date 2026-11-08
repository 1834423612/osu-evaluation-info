import { readJsonLimited, withDeadline } from "./http.ts";
import {
  MAX_TRANSLATION_BATCH_LENGTH,
  MAX_TRANSLATION_BATCH_SIZE,
  parseTranslationBatch,
  TranslationUnavailableError,
  validTranslationResult,
  type TranslationItem,
  type TranslationResult,
  type TranslationTarget,
} from "./service.ts";

type Success = Extract<TranslationResult, { status: "translated" }>;
type Queued = {
  item: TranslationItem;
  resolve: (result: Success) => void;
  reject: (reason: unknown) => void;
};

/** Coalesce snippets only after Chrome has failed; correlate responses by ID, never array position. */
export function createRemoteTranslationClient(
  fetcher: typeof fetch = fetch,
  delayMs = 25,
) {
  const queue: Queued[] = [];
  const pending = new Map<string, Promise<Success>>();
  let nextId = 0;
  let running = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (timer || !queue.length || running >= 2) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delayMs);
  }

  async function flush() {
    if (running >= 2 || !queue.length) return;
    const batch: Queued[] = [];
    let characters = 0;
    while (
      queue.length &&
      batch.length < MAX_TRANSLATION_BATCH_SIZE &&
      characters + queue[0].item.text.length <= MAX_TRANSLATION_BATCH_LENGTH
    ) {
      const queued = queue.shift()!;
      characters += queued.item.text.length;
      batch.push(queued);
    }
    running++;
    schedule();
    try {
      const payload = await withDeadline(async (signal) => {
        const response = await fetcher("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ items: batch.map(({ item }) => item) }),
          signal,
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          throw new TranslationUnavailableError();
        }
        return readJsonLimited(response, 256 * 1024, signal);
      }, 20_000);
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { version?: unknown }).version !== 1 ||
        !Array.isArray((payload as { results?: unknown }).results)
      )
        throw new TranslationUnavailableError();
      const results = (payload as { results: unknown[] }).results;
      for (const queued of batch) {
        const matches = results.filter(
          (result) =>
            result &&
            typeof result === "object" &&
            (result as { id?: unknown }).id === queued.item.id,
        );
        const value = matches[0] as Partial<Success> | undefined;
        if (
          matches.length !== 1 ||
          !value ||
          value.status !== "translated" ||
          value.target !== queued.item.target ||
          typeof value.translation !== "string" ||
          !["ollama", "dict-chrome-ex", "clients5", "gtx"].includes(
            value.provider ?? "",
          ) ||
          !["miss", "hit", "shared"].includes(value.cache ?? "") ||
          typeof value.durationMs !== "number" ||
          !Number.isFinite(value.durationMs) ||
          value.durationMs < 0 ||
          !validTranslationResult(
            value.translation,
            queued.item.text,
            queued.item.target,
          )
        ) {
          queued.reject(new TranslationUnavailableError());
        } else queued.resolve(value as Success);
      }
    } catch (error) {
      for (const queued of batch) queued.reject(error);
    } finally {
      running--;
      schedule();
    }
  }

  function request(text: string, target: TranslationTarget): Promise<Success> {
    const key = `${target}\0${text}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const item = { id: String(nextId++), text, target };
    if (!parseTranslationBatch({ items: [item] }) || queue.length >= 200)
      return Promise.reject(new TranslationUnavailableError());
    const operation = new Promise<Success>((resolve, reject) => {
      queue.push({ item, resolve, reject });
    }).finally(() => pending.delete(key));
    pending.set(key, operation);
    schedule();
    return operation;
  }
  return { request };
}

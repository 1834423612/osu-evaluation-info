import { TranslationUnavailableError } from "./service.ts";

/** Bound both streamed bodies and slow responses, including after headers arrive. */
export async function readJsonLimited(
  message: Request | Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<unknown> {
  const reader = message.body?.getReader();
  if (!reader) throw new TranslationUnavailableError();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    if (
      !message.headers
        .get("content-type")
        ?.toLowerCase()
        .includes("application/json") ||
      Number(message.headers.get("content-length")) > maxBytes
    )
      throw new TranslationUnavailableError();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new TranslationUnavailableError();
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(
        new DOMException("Translation timed out.", "TimeoutError"),
      );
      reject(controller.signal.reason);
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

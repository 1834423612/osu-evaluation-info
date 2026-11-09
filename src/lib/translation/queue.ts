import { TranslationUnavailableError } from "./service.ts";

/** Bounded FIFO waiting is separate from provider failures and inference timeouts. */
export function createTranslationQueue(
  concurrency = 1,
  limit = 32,
  waitMs = 30_000,
) {
  const waiting: Array<{ start: () => void; expire: () => void }> = [];
  let running = 0;

  function pump() {
    while (running < concurrency && waiting.length) waiting.shift()!.start();
  }

  function run<Value>(
    operation: () => Promise<Value>,
    onQueued?: () => void,
  ): Promise<Value> {
    if (waiting.length >= limit)
      return Promise.reject(new TranslationUnavailableError(1000));
    return new Promise<Value>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const entry = {
        start() {
          clearTimeout(timer);
          running++;
          let work: Promise<Value>;
          try {
            work = operation();
          } catch (error) {
            work = Promise.reject(error);
          }
          void work.then(resolve, reject).finally(() => {
            running--;
            pump();
          });
        },
        expire() {
          const index = waiting.indexOf(entry);
          if (index < 0) return;
          waiting.splice(index, 1);
          reject(new TranslationUnavailableError(1000));
        },
      };
      if (running >= concurrency || waiting.length) {
        onQueued?.();
        timer = setTimeout(entry.expire, waitMs);
      }
      waiting.push(entry);
      pump();
    });
  }
  return { run };
}

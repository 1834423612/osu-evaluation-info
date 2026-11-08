/** Share work across duplicate previews, details and review snippets. */
export function createTranslationScheduler(
  concurrency = 2,
  cacheLimit = 300,
  now = Date.now,
) {
  const cache = new Map<string, { value: string; expires: number }>();
  const failures = new Map<string, { error: unknown; expires: number }>();
  const pending = new Map<string, Promise<string>>();
  const queue: Array<() => void> = [];
  let running = 0;

  function runNext() {
    while (running < concurrency && queue.length) queue.shift()!();
  }

  function request(
    key: string,
    operation: () => Promise<string>,
    retry = false,
  ) {
    const saved = cache.get(key);
    if (saved && saved.expires > now()) return Promise.resolve(saved.value);
    if (saved) cache.delete(key);
    const active = pending.get(key);
    if (active) return active;
    const failure = failures.get(key);
    if (!retry && failure && failure.expires > now())
      return Promise.reject(failure.error);
    if (failure) failures.delete(key);
    if (queue.length >= 200)
      return Promise.reject(
        new Error("Translation capacity is temporarily full."),
      );

    const result = new Promise<string>((resolve, reject) => {
      queue.push(() => {
        running++;
        let work: Promise<string>;
        try {
          // Start synchronously while a direct click still has user activation.
          work = operation();
        } catch (error) {
          work = Promise.reject(error);
        }
        void work
          .then(
            (value) => {
              if (pending.get(key) === result) pending.delete(key);
              cache.delete(key);
              // A fallback must not pin later requests away from a recovered NAS forever.
              cache.set(key, { value, expires: now() + 30_000 });
              while (cache.size > cacheLimit)
                cache.delete(cache.keys().next().value!);
              resolve(value);
            },
            (error) => {
              if (pending.get(key) === result) pending.delete(key);
              if (error instanceof Error && error.name === "AbortError") {
                reject(error);
                return;
              }
              const hint =
                error instanceof Error && "retryAfterMs" in error
                  ? Number(error.retryAfterMs)
                  : 5000;
              failures.set(key, {
                error,
                expires:
                  now() +
                  Math.min(
                    60_000,
                    Math.max(1000, Number.isFinite(hint) ? hint : 5000),
                  ),
              });
              while (failures.size > cacheLimit)
                failures.delete(failures.keys().next().value!);
              reject(error);
            },
          )
          .finally(() => {
            if (pending.get(key) === result) pending.delete(key);
            running--;
            runNext();
          });
      });
    });
    pending.set(key, result);
    runNext();
    return result;
  }

  return { request };
}

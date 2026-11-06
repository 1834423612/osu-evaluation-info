/** Share work across duplicate previews, details and review snippets. */
export function createTranslationScheduler(
  concurrency = 2,
  cacheLimit = 300,
  now = Date.now,
) {
  const cache = new Map<string, string>();
  const failures = new Map<string, { error: unknown; expires: number }>();
  const pending = new Map<string, Promise<string>>();
  const queue: Array<() => void> = [];
  let running = 0;
  let consecutiveFailures = 0;
  let retryAfter = 0;

  function runNext() {
    while (running < concurrency && queue.length) queue.shift()!();
  }

  function request(key: string, operation: () => Promise<string>) {
    const saved = cache.get(key);
    if (saved !== undefined) return Promise.resolve(saved);
    const active = pending.get(key);
    if (active) return active;
    const failure = failures.get(key);
    if (failure && failure.expires > now())
      return Promise.reject(failure.error);
    if (failure) failures.delete(key);
    if (retryAfter > now())
      return Promise.reject(
        new Error("Translation is temporarily unavailable."),
      );
    if (queue.length >= 200)
      return Promise.reject(
        new Error("Translation capacity is temporarily full."),
      );

    const result = new Promise<string>((resolve, reject) => {
      queue.push(() => {
        running++;
        let work: Promise<string>;
        try {
          if (retryAfter > now())
            throw new Error("Translation is temporarily unavailable.");
          // Start synchronously while a direct click still has user activation.
          work = operation();
        } catch (error) {
          work = Promise.reject(error);
        }
        void work
          .then(
            (value) => {
              consecutiveFailures = 0;
              cache.delete(key);
              cache.set(key, value);
              while (cache.size > cacheLimit)
                cache.delete(cache.keys().next().value!);
              resolve(value);
            },
            (error) => {
              if (error instanceof Error && error.name === "AbortError") {
                reject(error);
                return;
              }
              consecutiveFailures++;
              failures.set(key, { error, expires: now() + 30_000 });
              while (failures.size > cacheLimit)
                failures.delete(failures.keys().next().value!);
              if (consecutiveFailures >= 3 && retryAfter <= now())
                retryAfter = now() + 30_000;
              reject(error);
            },
          )
          .finally(() => {
            pending.delete(key);
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

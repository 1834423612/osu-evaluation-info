/** Per-snippet backoff survives visibility changes; manual retries may still run immediately. */
export function createTranslationRetry(now = Date.now) {
  let failures = 0;
  let retryAt = 0;
  return {
    reset() {
      failures = 0;
      retryAt = 0;
    },
    fail(hint = 5000) {
      failures = Math.min(failures + 1, 7);
      const delay = Math.min(
        300_000,
        Math.max(
          5000 * 2 ** (failures - 1),
          Number.isFinite(hint) ? hint : 5000,
        ),
      );
      retryAt = now() + delay;
    },
    remaining: () => Math.max(0, retryAt - now()),
  };
}

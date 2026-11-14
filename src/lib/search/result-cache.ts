export class SearchCapacityError extends Error {}
/** Generation-scoped immutable pages: bounded memory, one load for identical users. */
export function createSearchResultCache<T>({
  maxEntries = 96,
  maxBytes = 12 * 1024 * 1024,
  maxPending = 128,
  ttl = 120000,
} = {}) {
  const ready = new Map<string, { value: T; bytes: number; expires: number }>(),
    pending = new Map<string, Promise<T>>();
  let bytes = 0;
  const drop = (key: string) => {
    const entry = ready.get(key);
    if (entry) {
      bytes -= entry.bytes;
      ready.delete(key);
    }
  };
  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const hit = ready.get(key);
      if (hit && hit.expires > Date.now()) {
        ready.delete(key);
        ready.set(key, hit);
        return hit.value;
      }
      drop(key);
      const running = pending.get(key);
      if (running) return running;
      if (pending.size >= maxPending)
        throw new SearchCapacityError("Search capacity reached");
      const job = Promise.resolve()
        .then(load)
        .then((value) => {
          const size = new TextEncoder().encode(
            JSON.stringify(value),
          ).byteLength;
          if (size <= maxBytes) {
            while (ready.size >= maxEntries || bytes + size > maxBytes) {
              const oldest = ready.keys().next().value;
              if (oldest === undefined) break;
              drop(oldest);
            }
            ready.set(key, { value, bytes: size, expires: Date.now() + ttl });
            bytes += size;
          }
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, job);
      return job;
    },
    stats: () => ({ entries: ready.size, bytes, pending: pending.size }),
  };
}

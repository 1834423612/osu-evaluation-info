/** One shared build at a time; failed builds never replace a ready generation. */
export function createIndexCache<T>(maximum = 2) {
  const ready = new Map<string, T>(),
    pending = new Map<string, Promise<T>>();
  let tail: Promise<unknown> = Promise.resolve();
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      if (ready.has(key)) {
        const value = ready.get(key)!;
        ready.delete(key);
        ready.set(key, value);
        return Promise.resolve(value);
      }
      const saved = pending.get(key);
      if (saved) return saved;
      if (pending.size >= 8)
        return Promise.reject(new Error("Search index build queue is full"));
      const promise = tail
        .then(load)
        .then((value) => {
          ready.set(key, value);
          while (ready.size > maximum) ready.delete(ready.keys().next().value!);
          return value;
        })
        .finally(() => pending.delete(key));
      tail = promise.catch(() => {});
      pending.set(key, promise);
      return promise;
    },
    size: () => ready.size,
  };
}

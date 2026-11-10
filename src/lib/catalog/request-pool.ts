import { cacheBypassed } from "../debug/flags.ts";
export class RequestQueueFullError extends Error {
  constructor() {
    super("Availability queue is busy. Try again shortly.");
  }
}

type Job<T> = {
  key: string;
  priority: number;
  controller: AbortController;
  readers: number;
  settled: boolean;
  promise: Promise<T>;
  run: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

/** A process-wide admission queue: bounded concurrency, spaced starts, shared reads. */
export function createRequestPool<T>({
  concurrency = 2,
  minStartIntervalMs = 500,
  maxQueued = 120,
  cacheMs = 0,
  onCancel,
}: {
  concurrency?: number;
  minStartIntervalMs?: number;
  maxQueued?: number;
  cacheMs?: number;
  onCancel?: (key: string) => void;
} = {}) {
  const pending = new Map<string, Job<T>>();
  const cache = new Map<string, { value: T; expires: number }>();
  const queue: Job<T>[] = [];
  let active = 0;
  let lastStart = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let blockedUntil = 0;

  function drain() {
    if (timer || active >= concurrency || !queue.length) return;
    const wait = Math.max(
      0,
      lastStart + minStartIntervalMs - Date.now(),
      blockedUntil - Date.now(),
    );
    timer = setTimeout(() => {
      timer = undefined;
      if (active >= concurrency) return;
      queue.sort((a, b) => a.priority - b.priority);
      const job = queue.shift();
      if (!job) return;
      if (job.controller.signal.aborted) {
        drain();
        return;
      }
      active++;
      lastStart = Date.now();
      void job
        .run(job.controller.signal)
        .then((value) => {
          if (job.controller.signal.aborted) throw job.controller.signal.reason;
          if (cacheMs) {
            cache.set(job.key, { value, expires: Date.now() + cacheMs });
            while (cache.size > 512) cache.delete(cache.keys().next().value!);
          }
          job.resolve(value);
        })
        .catch(job.reject)
        .finally(() => {
          job.settled = true;
          if (pending.get(job.key) === job) pending.delete(job.key);
          active--;
          drain();
        });
      drain();
    }, wait);
  }

  function cancel(job: Job<T>) {
    if (job.settled || job.controller.signal.aborted) return;
    job.controller.abort(new DOMException("Request cancelled", "AbortError"));
    if (pending.get(job.key) === job) onCancel?.(job.key);
    const index = queue.indexOf(job);
    if (index >= 0) {
      queue.splice(index, 1);
      job.settled = true;
      if (pending.get(job.key) === job) pending.delete(job.key);
      job.reject(job.controller.signal.reason);
    }
    if (!queue.length && timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function read(
    key: string,
    run: Job<T>["run"],
    { signal, priority = 0 }: { signal?: AbortSignal; priority?: number } = {},
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const saved = cache.get(key);
    if (!cacheBypassed() && saved && saved.expires > Date.now())
      return Promise.resolve(saved.value);
    cache.delete(key);
    let job = pending.get(key);
    if (job?.controller.signal.aborted) job = undefined;
    if (!job) {
      if (queue.length >= maxQueued)
        return Promise.reject(new RequestQueueFullError());
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      job = {
        key,
        run,
        priority,
        controller: new AbortController(),
        readers: 0,
        settled: false,
        promise,
        resolve,
        reject,
      };
      pending.set(key, job);
      queue.push(job);
      drain();
    } else job.priority = Math.min(job.priority, priority);
    const shared = job;
    shared.readers++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const release = () => {
        if (finished) return false;
        finished = true;
        signal?.removeEventListener("abort", abort);
        shared.readers--;
        return true;
      };
      const abort = () => {
        if (!release()) return;
        if (!shared.readers) cancel(shared);
        reject(
          signal?.reason ?? new DOMException("Request cancelled", "AbortError"),
        );
      };
      signal?.addEventListener("abort", abort, { once: true });
      shared.promise.then(
        (value) => {
          if (release()) resolve(value);
        },
        (error) => {
          if (release()) reject(error);
        },
      );
    });
  }

  return {
    read,
    cancelBackground() {
      for (const job of pending.values()) if (job.priority > 0) cancel(job);
    },
    backoff(ms: number) {
      blockedUntil = Math.max(
        blockedUntil,
        Date.now() + Math.min(60_000, Math.max(0, ms)),
      );
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      drain();
    },
  };
}

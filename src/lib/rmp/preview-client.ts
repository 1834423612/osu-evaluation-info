import { cacheBypassed } from "../debug/flags.ts";
import { debugFetch, debugServiceControlled } from "../debug/services.ts";
import type { CourseRmpInput } from "./types";
import type { RmpInsight } from "./insights";

export function createRmpPreviewClient(
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  const cache = new Map<string, { expires: number; value: RmpInsight }>();
  const pending = new Map<string, Promise<RmpInsight | null>>();
  const queue: {
    key: string;
    input: CourseRmpInput;
    resolve: (value: RmpInsight | null) => void;
  }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  async function flush() {
    timer = undefined;
    if (running) return;
    running = true;
    const batch = queue.splice(0, 24);
    try {
      const response = await debugFetch(
        "rmp",
        "/api/rmp/summaries",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courses: batch.map((item, index) => ({
              ...item.input,
              id: String(index),
            })),
          }),
          signal: AbortSignal.timeout(12_000),
        },
        fetcher,
      );
      if (!response.ok) throw new Error("RMP unavailable");
      const body = await response.json();
      batch.forEach((item, index) => {
        const value = body.summaries?.[String(index)] as RmpInsight | undefined;
        if (
          value &&
          ["available", "no-data", "unavailable"].includes(value.status) &&
          Array.isArray(value.tags)
        ) {
          cache.set(item.key, {
            expires:
              Date.now() + (value.status === "unavailable" ? 30_000 : 300_000),
            value,
          });
          while (cache.size > 300) cache.delete(cache.keys().next().value!);
          item.resolve(value);
        } else item.resolve(null);
      });
    } catch {
      batch.forEach((item) => item.resolve(null));
    } finally {
      for (const item of batch) pending.delete(item.key);
      running = false;
      if (queue.length)
        timer = setTimeout(() => {
          void flush();
        }, 50);
    }
  }
  return {
    request(input: CourseRmpInput) {
      const key = JSON.stringify(input);
      const saved = cache.get(key);
      if (
        !debugServiceControlled("rmp") &&
        !cacheBypassed() &&
        saved &&
        saved.expires > Date.now()
      )
        return Promise.resolve(saved.value);
      const active = pending.get(key);
      if (active) return active;
      if (queue.length >= 200) return Promise.resolve(null);
      const promise = new Promise<RmpInsight | null>((resolve) => {
        queue.push({ key, input, resolve });
      });
      pending.set(key, promise);
      if (!timer && !running)
        timer = setTimeout(() => {
          void flush();
        }, 50);
      return promise;
    },
  };
}
export const rmpPreviews = createRmpPreviewClient();

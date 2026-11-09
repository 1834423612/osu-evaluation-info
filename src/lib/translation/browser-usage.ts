import type { TranslationObservation } from "./gateway.ts";
import { withDeadline } from "./http.ts";

/** Best-effort counters only; Google text and responses never pass through this endpoint. */
export function createBrowserUsageReporter(fetcher: typeof fetch = fetch) {
  const pending: TranslationObservation[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (event: TranslationObservation) => {
    pending.push(event);
    if (pending.length > 32) pending.shift();
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const events = pending.splice(0);
      void withDeadline(async (signal) => {
        const response = await fetcher("/api/translate/usage", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events }),
          signal,
        });
        await response.body?.cancel();
      }, 2000).catch(() => undefined);
    }, 100);
  };
}

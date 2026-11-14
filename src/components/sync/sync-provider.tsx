"use client";
import { useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { setSavedScope, setAuthenticatedAccount } from "@/lib/saved/scope";
import { SYNC_EVENT, readSyncState, syncCycle } from "@/lib/sync/client";
import { debugFlag } from "@/lib/debug/flags";
export function SyncProvider() {
  const { data: session, isPending } = authClient.useSession();
  const accountId = session?.user.emailVerified ? session.user.id : null;
  useEffect(() => {
    if (isPending) return;
    setAuthenticatedAccount(accountId);
    let stopped = false,
      running = false,
      retryAfter = 0,
      failures = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    setSavedScope(null);
    async function tick() {
      if (stopped || running || !accountId || debugFlag("factory")) return;
      if (Date.now() < retryAfter) {
        schedule();
        return;
      }
      running = true;
      try {
        const state = await readSyncState(accountId);
        if (stopped) return;
        if (state.initialized) setSavedScope(accountId);
        if (state.enabled) {
          await syncCycle(accountId);
          failures = 0;
          retryAfter = 0;
        }
      } catch {
        failures++;
        retryAfter =
          Date.now() + Math.min(60000, 2000 * 2 ** Math.min(failures, 5));
      } finally {
        running = false;
      }
    }
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => void tick(),
        Math.max(750, retryAfter - Date.now()),
      );
    }
    function pending() {
      if (accountId)
        void readSyncState(accountId)
          .then((s) => {
            if (!stopped && navigator.onLine && s.enabled && s.outbox.length)
              schedule();
          })
          .catch(() => {});
    }
    void tick();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, 30000);
    window.addEventListener("course-atlas:preferences", schedule);
    window.addEventListener("storage", schedule);
    window.addEventListener(SYNC_EVENT, pending);
    window.addEventListener("online", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("course-atlas:preferences", schedule);
      window.removeEventListener("storage", schedule);
      window.removeEventListener(SYNC_EVENT, pending);
      window.removeEventListener("online", schedule);
      document.removeEventListener("visibilitychange", schedule);
      setSavedScope(null);
      setAuthenticatedAccount(null);
    };
  }, [accountId, isPending]);
  return null;
}

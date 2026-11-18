"use client";
import { useSyncExternalStore } from "react";
import { authenticatedAccount } from "../saved/scope.ts";
type Status = { development: boolean; linked: boolean };
const values = new Map<string, Status>(),
  attempts = new Map<string, number>();
const event = "course-atlas:development-link";
const empty: Status = { development: false, linked: false };
export function resetDevelopmentStatus(account: string) {
  attempts.delete(account);
}
export async function pullDevelopmentAccount(account: string) {
  if (Date.now() - (attempts.get(account) ?? 0) < 60000) return;
  attempts.set(account, Date.now());
  const response = await fetch("/api/account/development", {
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) return;
  const status = await response.json();
  if (authenticatedAccount() !== account) return;
  values.set(account, {
    development: !!status.development,
    linked: !!status.linked,
  });
  window.dispatchEvent(new Event(event));
  if (status.development && status.linked) {
    const result = await fetch("/api/account/development", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull" }),
      signal: AbortSignal.timeout(10000),
    });
    return result.ok;
  }
  return false;
}
export const pullDevelopment = pullDevelopmentAccount;
export function useDevelopmentAccount(account: string | undefined) {
  return useSyncExternalStore(
    (change) => {
      window.addEventListener(event, change);
      return () => window.removeEventListener(event, change);
    },
    () => (account ? (values.get(account) ?? empty) : empty),
    () => empty,
  );
}

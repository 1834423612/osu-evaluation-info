"use client";
import { ensureActorSession } from "./share-links.ts";
export type TransferSummary = {
  id: string;
  title: string;
  items: number;
  capability: string;
  code: string | null;
  expiresAt: string;
  pairs: { id: string; challenge: string; approved: boolean }[];
};
export const TRANSFER_EVENT = "course-atlas:transfer-change";
export async function transferRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  if (
    body &&
    !(typeof body === "object" && "action" in body && body.action === "status")
  )
    await ensureActorSession();
  const r = await fetch(
    "/api/transfers" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        }
      : { cache: "no-store", signal: AbortSignal.timeout(15000) },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "unavailable");
  return data;
}
export function transferLink(origin: string, id: string, capability: string) {
  return (
    origin +
    "/transfer/" +
    encodeURIComponent(id) +
    "#k=" +
    encodeURIComponent(capability)
  );
}

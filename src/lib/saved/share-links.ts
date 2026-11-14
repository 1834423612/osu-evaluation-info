import { browserStorage } from "../preferences/browser-storage";
export type LocalShare = {
  id: string;
  url: string;
  management: string;
  title: string;
  expiresAt: string;
};
const KEY = "course-atlas:share-links:v1";
export function rememberShare(value: LocalShare) {
  try {
    const current = readShareLinks();
    browserStorage().setItem(
      KEY,
      JSON.stringify(
        [value, ...current.filter((x) => x.id !== value.id)].slice(0, 100),
      ),
    );
  } catch {}
}
export function readShareLinks(): LocalShare[] {
  try {
    const raw = JSON.parse(browserStorage().getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter(
          (x) =>
            typeof x?.id === "string" &&
            typeof x.url === "string" &&
            typeof x.management === "string",
        )
      : [];
  } catch {
    return [];
  }
}
export function shareLink(
  origin: string,
  id: string,
  capability?: string | null,
) {
  return (
    origin +
    "/share/" +
    id +
    (capability ? "#k=" + encodeURIComponent(capability) : "")
  );
}
export function linkCapability(family: "share" | "transfer", id: string) {
  if (typeof window === "undefined") return undefined;
  const first = (
    window as Window & {
      __WAHO_LINK_CAPABILITY__?: {
        family: string;
        id: string;
        capability: string;
      };
    }
  ).__WAHO_LINK_CAPABILITY__;
  if (first?.family === family && first.id === id) return first.capability;
  try {
    return (
      sessionStorage.getItem("course-atlas:capability:" + family + ":" + id) ??
      undefined
    );
  } catch {
    return undefined;
  }
}

export async function copyLink(value: string) {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
export function sharingDate(value: string, locale: "en" | "zh") {
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
let sessionReady: Promise<void> | null = null;
export function ensureActorSession() {
  return (sessionReady ??= fetch("/api/user-data/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
    .then((response) => {
      if (!response.ok) throw new Error("Session unavailable");
    })
    .catch((error) => {
      sessionReady = null;
      throw error;
    }));
}
export function browserRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-" +
    hex.slice(12, 16) +
    "-" +
    hex.slice(16, 20) +
    "-" +
    hex.slice(20)
  );
}

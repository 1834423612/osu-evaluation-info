import { authenticatedAccount } from "./scope.ts";
import { browserUuid } from "../uuid.ts";
import { browserStorage } from "../preferences/browser-storage.ts";
export type LocalShare = {
  id: string;
  url: string;
  management: string;
  title: string;
  expiresAt: string | null;
};
const shareKey = () =>
  "course-atlas:share-links:v2:" +
  (authenticatedAccount() ? "account:" + authenticatedAccount() : "guest");
export function rememberShare(value: LocalShare) {
  try {
    const current = readShareLinks();
    browserStorage().setItem(
      shareKey(),
      JSON.stringify(
        [value, ...current.filter((x) => x.id !== value.id)].slice(0, 100),
      ),
    );
  } catch {}
}
export function readShareLinks(): LocalShare[] {
  try {
    const raw = JSON.parse(browserStorage().getItem(shareKey()) ?? "[]");
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
export function linkCapability(
  family: "share" | "transfer" | "calendar",
  id: string,
) {
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
export function sharingDate(value: string | null, locale: "en" | "zh") {
  if (!value) return locale === "zh" ? "长期有效，直到撤销" : "Until revoked";
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
  return browserUuid();
}

export const ANALYTICS_KEY = "course-atlas:analytics:v1";
export const ANALYTICS_EVENT = "course-atlas:analytics-change";
export type AnalyticsPreference = { enabled: boolean; replay: boolean };
export const DEFAULT_ANALYTICS: AnalyticsPreference = {
  enabled: true,
  replay: true,
};
export function parseAnalyticsPreference(
  raw: string | null,
): AnalyticsPreference {
  try {
    const v = JSON.parse(raw ?? "null");
    return { enabled: v?.enabled !== false, replay: v?.replay !== false };
  } catch {
    return DEFAULT_ANALYTICS;
  }
}
export function privateAnalyticsPath(path: string) {
  return /^\/(?:account|saved|share|transfer|history|diagnostics)(?:\/|$)/.test(
    path,
  );
}
export function analyticsAssetUrl(value: string, version = "3.5.0") {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.searchParams.set("v", version);
    return url.href;
  } catch {
    return "";
  }
}
export function safeSearchTerm(value: string) {
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (
    /@|(?:token|password|secret|recovery|authorization)\s*[:=]|[A-Za-z0-9_-]{32,}/i.test(
      text,
    )
  )
    return "[redacted]";
  return text.slice(0, 80);
}
/** Self-contained: serialized into the beforeInteractive bootstrap. */
export function analyticsBeforeSend(
  type: string,
  payload: Record<string, unknown>,
) {
  const w = window as Window & {
    __COURSE_ATLAS_DEBUG__?: { skipAnalytics?: boolean };
  };
  if (
    w.__COURSE_ATLAS_DEBUG__?.skipAnalytics ||
    /^\/(account|saved|share|transfer|history|diagnostics)(\/|$)/.test(
      location.pathname,
    )
  )
    return false;
  try {
    const setting = JSON.parse(
      localStorage.getItem("course-atlas:analytics:v1") || "null",
    );
    if (
      setting?.enabled === false ||
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl
    )
      return false;
  } catch {
    /* Restricted storage does not break the application. */
  }
  if (!payload || typeof payload !== "object") return payload;
  const clean = (v: unknown, key = "", depth = 0): unknown => {
    if (
      depth > 5 ||
      /password|token|cookie|authorization|email|secret|recovery/i.test(key)
    )
      return undefined;
    if (typeof v === "string") {
      if (["url", "referrer", "filename"].includes(key)) {
        try {
          const u = new URL(v, location.origin);
          if (
            /^\/(account|saved|share|transfer|history|diagnostics)(\/|$)/.test(
              u.pathname,
            )
          )
            return u.origin + "/private";
          const params = new URLSearchParams();
          for (const [k, x] of u.searchParams)
            if (/^utm_(source|medium|campaign|term|content)$/i.test(k))
              params.set(k, x.slice(0, 80));
          u.search = params.toString();
          u.hash = "";
          return u.href;
        } catch {
          return "";
        }
      }
      return v
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
        .replace(
          /([?&#](?:token|code|key|secret|password|capability)=)[^\s&#)]+/gi,
          "$1[redacted]",
        )
        .slice(0, type === "error" ? 6000 : 160);
    }
    if (Array.isArray(v))
      return v.slice(0, 30).map((x) => clean(x, key, depth + 1));
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .map(([k, x]) => [k, clean(x, k, depth + 1)])
          .filter(([, x]) => x !== undefined),
      );
    return v;
  };
  return clean(payload);
}

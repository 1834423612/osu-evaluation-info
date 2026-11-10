export type BuildInfo = {
  sha: string;
  message: string;
  updatedAt: string | null;
  timeKind: "commit" | "build";
  environment: "development" | "production";
};

export function commitSha(value: unknown) {
  return typeof value === "string" &&
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}
export function commitSubject(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/\r?\n/, 1)[0]
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 180)
    : "";
}
export function parseBuildInfo(value: unknown): BuildInfo | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<BuildInfo>,
    sha = commitSha(item.sha);
  if (
    !sha ||
    !["development", "production"].includes(item.environment ?? "") ||
    !["commit", "build"].includes(item.timeKind ?? "") ||
    typeof item.message !== "string" ||
    (item.updatedAt !== null &&
      (typeof item.updatedAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          item.updatedAt,
        ) ||
        !Number.isFinite(Date.parse(item.updatedAt))))
  )
    return null;
  return {
    sha,
    message: commitSubject(item.message),
    updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null,
    timeKind: item.timeKind!,
    environment: item.environment!,
  };
}

/** A hydration fallback only. Live metadata comes from the current origin's version endpoint. */
export function bundledBuildInfo(): BuildInfo | null {
  return parseBuildInfo({
    sha: process.env.NEXT_PUBLIC_BUILD_SHA,
    message: process.env.NEXT_PUBLIC_BUILD_MESSAGE ?? "",
    updatedAt: process.env.NEXT_PUBLIC_BUILD_UPDATED_AT || null,
    timeKind: process.env.NEXT_PUBLIC_BUILD_TIME_KIND ?? "commit",
    environment:
      process.env.NODE_ENV === "development" ? "development" : "production",
  });
}

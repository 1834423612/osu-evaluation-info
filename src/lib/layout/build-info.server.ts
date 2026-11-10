import { execFileSync } from "node:child_process";
import {
  bundledBuildInfo,
  commitSha,
  commitSubject,
  parseBuildInfo,
  type BuildInfo,
} from "./build-info.ts";

export type GitRevision = Pick<BuildInfo, "sha" | "message" | "updatedAt">;
type GitReader = (ref?: string) => GitRevision | null;
export function readGitRevision(ref = "HEAD"): GitRevision | null {
  if (ref !== "HEAD" && !commitSha(ref)) return null;
  try {
    const [sha, message, date] = execFileSync(
      "git",
      ["log", "-1", "--format=%H%x00%s%x00%cI", ref],
      { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] },
    )
      .trim()
      .split("\0");
    const info = parseBuildInfo({
      sha,
      message,
      updatedAt: date,
      timeKind: "commit",
      environment: "production",
    });
    return info
      ? { sha: info.sha, message: info.message, updatedAt: info.updatedAt }
      : null;
  } catch {
    return null;
  }
}

/** Capture one revision atomically; never pair a Vercel SHA with a different local HEAD's date. */
export function buildSnapshot(
  env: NodeJS.ProcessEnv,
  git: GitReader = readGitRevision,
  now = () => new Date(),
) {
  const development = env.NODE_ENV === "development";
  const sha = development ? null : commitSha(env.VERCEL_GIT_COMMIT_SHA);
  const revision = git(sha ?? "HEAD");
  const matching = revision && (!sha || revision.sha === sha) ? revision : null;
  return parseBuildInfo({
    sha: sha ?? matching?.sha,
    message:
      (sha && commitSubject(env.VERCEL_GIT_COMMIT_MESSAGE)) ||
      matching?.message ||
      "",
    updatedAt: matching?.updatedAt ?? now().toISOString(),
    timeKind: matching?.updatedAt ? "commit" : "build",
    environment: env.NODE_ENV === "development" ? "development" : "production",
  });
}

export function currentBuildInfo(
  env: NodeJS.ProcessEnv,
  fallback: BuildInfo | null,
  git: GitReader = readGitRevision,
): BuildInfo | null {
  if (env.NODE_ENV === "development") {
    const revision = git("HEAD");
    return revision
      ? parseBuildInfo({
          ...revision,
          timeKind: "commit",
          environment: "development",
        })
      : fallback
        ? { ...fallback, environment: "development" }
        : null;
  }
  const sha = commitSha(env.VERCEL_GIT_COMMIT_SHA);
  if (!sha) return fallback ? { ...fallback, environment: "production" } : null;
  const matched = fallback?.sha === sha ? fallback : null;
  const revision = matched ? null : git(sha);
  const exact = revision?.sha === sha ? revision : null;
  return parseBuildInfo({
    sha,
    message:
      commitSubject(env.VERCEL_GIT_COMMIT_MESSAGE) ||
      matched?.message ||
      exact?.message ||
      "",
    updatedAt: matched?.updatedAt ?? exact?.updatedAt ?? null,
    timeKind: matched?.timeKind ?? "commit",
    environment: "production",
  });
}

/** Short local deduplication: layout refreshes do not spawn one Git process per component. */
export function createBuildInfoReader(
  read: () => BuildInfo | null,
  now = Date.now,
  ttl = 2000,
) {
  let cached: BuildInfo | null | undefined,
    expires = 0;
  return () => {
    if (cached !== undefined && now() < expires) return cached;
    cached = read();
    expires = now() + ttl;
    return cached;
  };
}
export const readCurrentBuildInfo = createBuildInfoReader(() =>
  currentBuildInfo(process.env, bundledBuildInfo()),
);

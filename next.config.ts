import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

function gitValue(format: string) {
  try {
    return execFileSync("git", ["log", "-1", `--format=${format}`], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_HASH: (
      process.env.VERCEL_GIT_COMMIT_SHA || gitValue("%h")
    ).slice(0, 8),
    NEXT_PUBLIC_BUILD_MESSAGE: (
      process.env.VERCEL_GIT_COMMIT_MESSAGE || gitValue("%s")
    )
      .split(/\r?\n/)[0]
      .slice(0, 180),
    NEXT_PUBLIC_BUILD_UPDATED_AT: gitValue("%cI") || new Date().toISOString(),
  },
  allowedDevOrigins: process.env.DEV_TAILSCALE_IP
    ? [process.env.DEV_TAILSCALE_IP]
    : [],
  typedRoutes: true,
  serverExternalPackages: ["pg"],
};

export default nextConfig;

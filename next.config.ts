import type { NextConfig } from "next";
import { buildSnapshot } from "./src/lib/layout/build-info.server.ts";

const build = buildSnapshot(process.env);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: build?.sha ?? "",
    NEXT_PUBLIC_BUILD_HASH: build?.sha.slice(0, 8) ?? "",
    NEXT_PUBLIC_BUILD_MESSAGE: build?.message ?? "",
    NEXT_PUBLIC_BUILD_UPDATED_AT: build?.updatedAt ?? "",
    NEXT_PUBLIC_BUILD_TIME_KIND: build?.timeKind ?? "commit",
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "[::1]",
    ...Array.from({ length: 64 }, (_, index) => `100.${index + 64}.*.*`),
  ],
  typedRoutes: true,
  serverExternalPackages: ["pg"],
};

export default nextConfig;

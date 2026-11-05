import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.DEV_TAILSCALE_IP
    ? [process.env.DEV_TAILSCALE_IP]
    : [],
  typedRoutes: true,
  serverExternalPackages: ["pg"],
};

export default nextConfig;

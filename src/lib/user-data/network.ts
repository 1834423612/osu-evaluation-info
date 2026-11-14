import { isIP } from "node:net";
export function requestNetwork(
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env,
) {
  const header = env.USER_DATA_TRUSTED_PROXY_HEADER?.toLowerCase();
  if (!header || !/^[a-z0-9-]+$/.test(header))
    return { address: null, source: "not_configured" } as const;
  // This deployment contract requires the proxy to overwrite, not append, the header.
  const value = headers.get(header)?.trim();
  return value && isIP(value)
    ? { address: value, source: "trusted-proxy:" + header }
    : { address: null, source: "unavailable" };
}

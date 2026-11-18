import { lookup } from "node:dns/promises";
import { get } from "node:https";
import { isIP } from "node:net";
/** Resolve once and pin the connection to a public address for each redirect. */
export function publicCalendarAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19].includes(b)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 192 && b === 88 && c === 99)
    );
  }
  return (
    isIP(address) === 6 &&
    /^2[0-9a-f]{3}:/i.test(address) &&
    !/^(?:2001:(?:db8:|0*:)|2002:)/i.test(address)
  );
}
export async function readRemoteCalendar(
  input: string,
  redirects = 0,
  deadline = Date.now() + 15000,
): Promise<string> {
  const url = new URL(input.replace(/^webcal:/i, "https:"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    redirects > 3
  )
    throw Error("Invalid calendar URL");
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw Error("Calendar timed out");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Error("Calendar timed out")), remaining);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  if (
    !addresses.length ||
    addresses.some((item) => !publicCalendarAddress(item.address))
  )
    throw Error("Calendar address unavailable");
  const target = addresses[0];
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        timeout: Math.max(1, deadline - Date.now()),
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        headers: { Accept: "text/calendar", "User-Agent": "WahO-Calendar/1.0" },
        lookup: (_hostname, _options, callback) =>
          callback(null, target.address, target.family),
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode ?? 0) &&
          response.headers.location
        ) {
          response.resume();
          void readRemoteCalendar(
            new URL(response.headers.location, url).href,
            redirects + 1,
            deadline,
          ).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(Error("Calendar unavailable"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024)
            request.destroy(Error("Calendar too large"));
          else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve(Buffer.concat(chunks).toString("utf8")),
        );
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(Error("Calendar timed out")));
    request.on("error", reject);
  });
}

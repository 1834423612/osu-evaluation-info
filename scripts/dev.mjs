import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { networkInterfaces, release } from "node:os";
import { stripVTControlCharacters } from "node:util";

const require = createRequire(import.meta.url);
const isWsl = /microsoft/i.test(release());
const args = process.argv.slice(2);
const customHostname = args.some(
  (arg) =>
    arg.startsWith("-H") ||
    arg === "--hostname" ||
    arg.startsWith("--hostname="),
);

function run(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    timeout: 8_000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

let interfaces = [];
try {
  interfaces = Object.values(networkInterfaces()).flat().filter(Boolean);
} catch {
  // Restricted environments may not permit network-interface enumeration.
}

let tailscale;
for (const command of [
  "tailscale",
  ...(isWsl
    ? ["tailscale.exe", "/mnt/c/Program Files/Tailscale/tailscale.exe"]
    : []),
]) {
  try {
    const ip = run(command, ["ip", "-4"]);
    if (
      /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(ip)
    ) {
      tailscale = { command, ip };
      break;
    }
  } catch {
    // Tailscale is optional; keep local development available if it is offline.
  }
}

const needsForwarding =
  tailscale && !interfaces.some(({ address }) => address === tailscale.ip);
let forward;
let stopping = false;

function removeForward() {
  if (!forward) return;
  const { port, target } = forward;
  forward = undefined;
  try {
    const config = JSON.parse(
      run(tailscale.command, ["serve", "status", "--json"]),
    );
    // Remove only our own listener, and preserve all other Serve settings.
    if (config.TCP?.[port]?.TCPForward === target) {
      run(tailscale.command, ["serve", "--tcp", port, "off"]);
    }
  } catch (error) {
    console.error(
      `[dev] Could not remove Tailscale forwarding: ${error.message}`,
    );
  }
}

function share(localUrl) {
  if (!tailscale || customHostname || stopping) return;
  const url = new URL(localUrl);
  if (needsForwarding) {
    if (!isWsl || !tailscale.command.endsWith(".exe")) {
      console.warn(
        "[dev] Tailscale IP is not local; automatic forwarding is unavailable.",
      );
      return;
    }
    const port = url.port;
    // WSL NAT forwards Windows localhost to Linux. Direct access to the WSL
    // adapter address can be blocked by the Windows/Hyper-V firewall.
    const target = `127.0.0.1:${port}`;
    try {
      const config = JSON.parse(
        run(tailscale.command, ["serve", "status", "--json"]),
      );
      const configs = [config, ...Object.values(config.Foreground ?? {})];
      if (configs.some((entry) => entry.TCP?.[port])) {
        console.warn(
          `[dev] Tailscale Serve port ${port} is already configured; leaving it unchanged.`,
        );
        return;
      }
      run(tailscale.command, [
        "serve",
        "--bg",
        "--yes",
        "--tcp",
        port,
        `tcp://${target}`,
      ]);
      forward = { port, target };
      console.log(`[dev] Tailscale → WSL ${target} (removed on exit)`);
    } catch (error) {
      console.warn(
        `[dev] Tailscale forwarding failed: ${error.stderr?.toString().trim() || error.message}`,
      );
      return;
    }
  }
  url.hostname = tailscale.ip;
  console.log(`  - Tailscale:     ${url.origin}`);
}

if (!tailscale) {
  console.warn(
    "[dev] Tailscale IPv4 not detected; localhost remains available.",
  );
}

const next = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "dev",
    "--hostname",
    "0.0.0.0",
    ...args,
  ],
  {
    stdio: ["inherit", "pipe", "inherit"],
    env: { ...process.env, DEV_TAILSCALE_IP: tailscale?.ip ?? "" },
  },
);

// Read Next's actual URL, including automatic port fallback and HTTPS mode.
let output = "";
let shared = false;
next.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (shared) return;
  output += stripVTControlCharacters(chunk.toString());
  const match = output.match(/Local:\s+(https?:\/\/\S+)/);
  if (match) {
    shared = true;
    share(match[1]);
  }
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    stopping = true;
    removeForward();
    next.kill(signal);
  });
}
next.on("error", (error) => {
  console.error(`[dev] ${error.message}`);
  process.exitCode = 1;
});
next.on("exit", (code, signal) => {
  removeForward();
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});

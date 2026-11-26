import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isIP } from "node:net";
import { assistanceProposalInput } from "../../src/lib/rmp/assistance-types.ts";
export function parseAssistanceClient(args) {
  const command = args[0];
  if (!["export", "submit"].includes(command))
    throw Error("Use export or submit");
  const result = {
    command,
    base: "",
    job: "",
    file: "",
    allowLocalHttp: false,
    allowPrivateHttp: false,
  };
  const seen = new Set();
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw Error("Duplicate option");
    seen.add(flag);
    if (flag === "--allow-local-http") result.allowLocalHttp = true;
    else if (flag === "--allow-private-http") result.allowPrivateHttp = true;
    else if (
      ["--base", "--job", "--file"].includes(flag) &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    )
      result[flag.slice(2)] = args[++index];
    else throw Error("Invalid option");
  }
  let base;
  try {
    base = new URL(result.base);
  } catch {
    throw Error("An explicit base origin is required");
  }
  const hostname = base.hostname.replace(/^\[|\]$/g, "");
  const octets = hostname.split(".").map(Number);
  const loopback =
    hostname === "localhost" ||
    hostname === "::1" ||
    (isIP(hostname) === 4 && octets[0] === 127);
  const tailnet =
    isIP(hostname) === 4 &&
    octets[0] === 100 &&
    octets[1] >= 64 &&
    octets[1] <= 127;
  if (
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    (base.protocol !== "https:" &&
      !(
        base.protocol === "http:" &&
        ((result.allowLocalHttp && loopback) ||
          (result.allowPrivateHttp && (loopback || tailnet)))
      ))
  )
    throw Error(
      "Use an HTTPS base origin; loopback or Tailscale HTTP needs explicit opt-in",
    );
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      result.job,
    )
  )
    throw Error("A job UUID is required");
  if (command === "submit" && !result.file)
    throw Error("Submission requires --file");
  return { ...result, base: base.origin, job: result.job.toLowerCase() };
}
async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty response");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        await reader.cancel();
        throw Error("Response exceeded byte limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function runAssistanceClient(
  args,
  env = process.env,
  fetcher = fetch,
) {
  const input = parseAssistanceClient(args),
    token = env.RMP_ASSISTANCE_TOKEN;
  if (!/^waho-rmp-ai_[A-Za-z0-9_-]{43}$/.test(token ?? ""))
    throw Error("Set RMP_ASSISTANCE_TOKEN to the scoped job token");
  let body;
  if (input.command === "submit") {
    const information = await stat(input.file);
    if (information.size > 2_000_000)
      throw Error("Proposal exceeded byte limit");
    body = assistanceProposalInput.parse(
      JSON.parse(await readFile(input.file, "utf8")),
    );
    if (body.jobId !== input.job)
      throw Error("Proposal job does not match the requested job");
  }
  const response = await fetcher(
    input.base + "/api/admin/rmp/assistance/job/" + input.job,
    {
      method: body ? "POST" : "GET",
      redirect: "error",
      credentials: "omit",
      headers: {
        Authorization: "Bearer " + token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  if (!response.ok)
    throw Error("Assistance request failed (" + response.status + ")");
  return boundedJson(response);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      JSON.stringify(await runAssistanceClient(process.argv.slice(2)), null, 2),
    );
  } catch {
    console.error(
      "Assistance client failed. Check the explicit base origin, job, scoped token and input file.",
    );
    process.exitCode = 1;
  }
}

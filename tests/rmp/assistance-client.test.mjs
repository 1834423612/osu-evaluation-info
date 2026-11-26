import test from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../../src/lib/user-data/http.ts";
import {
  assistanceProposalInput,
  safeEvidenceUrl,
} from "../../src/lib/rmp/assistance-types.ts";
import {
  parseAssistanceClient,
  runAssistanceClient,
} from "../../scripts/rmp/assistance-client.mjs";
test("AI client uses only an explicit safe origin, omits cookies and refuses redirects", async () => {
  const job = "11111111-1111-4111-8111-111111111111";
  assert.throws(
    () =>
      parseAssistanceClient([
        "export",
        "--base",
        "https://user:password@example.test",
        "--job",
        job,
      ]),
    /HTTPS/,
  );
  assert.throws(
    () =>
      parseAssistanceClient([
        "export",
        "--base",
        "https://example.test/other-origin",
        "--job",
        job,
      ]),
    /HTTPS/,
  );
  assert.throws(
    () =>
      parseAssistanceClient([
        "export",
        "--base",
        "http://example.test",
        "--job",
        job,
      ]),
    /HTTPS/,
  );
  const calls = [];
  const output = await runAssistanceClient(
    ["export", "--base", "https://example.test", "--job", job],
    { RMP_ASSISTANCE_TOKEN: "waho-rmp-ai_" + "a".repeat(43) },
    async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ jobId: job, groups: [] }));
    },
  );
  assert.equal(
    calls[0].url,
    "https://example.test/api/admin/rmp/assistance/job/" + job,
  );
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(output.jobId, job);
});

test("explicit private HTTP permits only loopback and the Tailscale 100.64/10 range", () => {
  const job = "11111111-1111-4111-8111-111111111111";
  for (const base of [
    "http://127.0.0.1:3103",
    "http://[::1]:3103",
    "http://100.64.0.1:3103",
    "http://100.127.255.255:3103",
  ]) {
    const parsed = parseAssistanceClient([
      "export",
      "--base",
      base,
      "--job",
      job,
      "--allow-private-http",
    ]);
    assert.equal(parsed.base, base);
  }
  for (const base of [
    "http://100.63.255.255:3103",
    "http://100.128.0.1:3103",
    "http://10.0.0.1:3103",
    "http://8.8.8.8:3103",
    "http://user:secret@100.64.0.1:3103",
  ])
    assert.throws(() =>
      parseAssistanceClient([
        "export",
        "--base",
        base,
        "--job",
        job,
        "--allow-private-http",
      ]),
    );
  assert.throws(() =>
    parseAssistanceClient([
      "export",
      "--base",
      "http://100.64.0.1:3103",
      "--job",
      job,
    ]),
  );
});

test("AI submissions reject chunked oversized bodies before parsing and citation URLs cannot carry credentials", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1_000_001));
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request(
    "https://example.test/api/admin/rmp/assistance/job/11111111-1111-4111-8111-111111111111",
    {
      method: "POST",
      body,
      duplex: "half",
      headers: { "Content-Type": "application/json" },
    },
  );
  assert.equal(request.headers.has("content-length"), false);
  await assert.rejects(
    readJson(request, assistanceProposalInput, 2_000_000),
    (error) => error.code === "too_large" && error.status === 413,
  );
  assert.equal(cancelled, true);
  for (const url of [
    "https://user:secret@osu.edu/course",
    "javascript:alert(1)",
    "http://osu.edu/course",
  ])
    assert.equal(safeEvidenceUrl.safeParse(url).success, false);
  assert.equal(
    safeEvidenceUrl.safeParse("https://osu.edu/course").success,
    true,
  );
});

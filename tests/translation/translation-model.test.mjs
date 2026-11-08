import assert from "node:assert/strict";
import test from "node:test";
import { createRemoteTranslationClient } from "../../src/lib/translation/client.ts";

test("manual Google skips the NAS API, shares duplicates and keeps device-side endpoint recovery", async () => {
  const calls = [];
  const client = createRemoteTranslationClient(async (url, init) => {
    assert.notEqual(url, "/api/translate");
    assert.equal(init.mode, "cors");
    assert.equal(init.credentials, "omit");
    assert.equal(init.body, undefined);
    const endpoint = new URL(url);
    calls.push(endpoint.hostname);
    return endpoint.hostname === "clients5.google.com"
      ? Response.json(["谷歌译文"])
      : new Response(null, { status: 429 });
  }, 1);
  const first = client.request("Hello", "zh-CN", "google");
  assert.equal(client.request("Hello", "zh-CN", "google"), first);
  assert.equal((await first).provider, "clients5");
  assert.deepEqual(calls, ["translate.googleapis.com", "clients5.google.com"]);
});

test("manual NAS failures never fall back and cannot merge with automatic requests for the same text", async () => {
  const batches = [];
  const client = createRemoteTranslationClient(async (url, init) => {
    if (url !== "/api/translate") return Response.json(["自动回退译文"]);
    const { items } = JSON.parse(init.body);
    batches.push(items);
    return Response.json({
      version: 1,
      results: items.map(({ id, target }) => ({
        id,
        target,
        status: "unavailable",
        durationMs: 0,
        retryAfterMs: 1500,
      })),
    });
  }, 1);
  const manual = client.request("Hello", "zh-CN", "ollama");
  assert.equal(client.request("Hello", "zh-CN", "ollama"), manual);
  const automatic = client.request("Hello", "zh-CN");
  assert.notEqual(manual, automatic);
  const [nas, fallback] = await Promise.allSettled([manual, automatic]);
  assert.equal(nas.status, "rejected");
  assert.equal(nas.reason.retryAfterMs, 1500);
  assert.equal(fallback.value.provider, "dict-chrome-ex");
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  assert.notEqual(batches[0][0].id, batches[0][1].id);
});

test("manual NAS transport failures stay retryable without contacting Google", async () => {
  let healthy = false;
  let calls = 0;
  const client = createRemoteTranslationClient(async (url, init) => {
    assert.equal(url, "/api/translate");
    calls++;
    if (!healthy) throw Error("offline");
    const { items } = JSON.parse(init.body);
    return Response.json({
      version: 1,
      results: items.map(({ id, target }) => ({
        id,
        target,
        status: "translated",
        provider: "ollama",
        translation: "已恢复",
        cache: "miss",
        durationMs: 1,
      })),
    });
  }, 1);
  await assert.rejects(client.request("Hello", "zh-CN", "ollama"));
  healthy = true;
  assert.equal(
    (await client.request("Hello", "zh-CN", "ollama")).provider,
    "ollama",
  );
  assert.equal(calls, 2);
});

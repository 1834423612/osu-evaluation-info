import assert from "node:assert/strict";
import test from "node:test";
import { createTranslationHandler } from "../../src/lib/translation/handler.ts";
import { createTranslationGateway } from "../../src/lib/translation/gateway.ts";
import { createTranslationProviders } from "../../src/lib/translation/providers.ts";
import { createRemoteTranslationClient } from "../../src/lib/translation/client.ts";

const item = (id, text = "Hello") => ({ id, text, target: "zh-CN" });
const success = ({ id, target }) => ({
  id,
  target,
  status: "translated",
  provider: "ollama",
  cache: "miss",
  translation: "你好",
  durationMs: 10,
});
const request = (body) =>
  new Request("http://localhost/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("legacy and batch requests expose only normalized no-store results", async () => {
  const handler = createTranslationHandler(async (items) => items.map(success));
  const legacy = await handler(request({ text: "Hello", target: "zh" }));
  assert.equal(legacy.status, 200);
  assert.equal(legacy.headers.get("cache-control"), "no-store");
  assert.equal((await legacy.json()).translation, "你好");
  const result = await handler(request({ items: [item("a"), item("b")] }));
  assert.deepEqual(
    (await result.json()).results.map(({ id }) => id),
    ["a", "b"],
  );
});

test("invalid or oversized inputs never reach upstream and errors conceal private data", async () => {
  let calls = 0;
  const handler = createTranslationHandler(async () => {
    calls++;
    throw Error("private credentials");
  });
  for (const body of [
    { text: "", target: "en" },
    { text: "Hello", target: "ja" },
    { items: [item("same"), item("same")] },
    { text: "x".repeat(50000), target: "en" },
  ])
    assert.equal((await handler(request(body))).status, 400);
  assert.equal(calls, 0);
  const result = await handler(request({ text: "Hello", target: "en" }));
  assert.equal(result.status, 503);
  assert.equal((await result.text()).includes("private"), false);
});

test("rate limiting counts items, not just HTTP batches, and resets each minute", async () => {
  let time = 1000;
  const handler = createTranslationHandler(
    async (items) => items.map(success),
    () => time,
  );
  const batch = { items: Array.from({ length: 8 }, (_, i) => item(String(i))) };
  for (let i = 0; i < 3; i++)
    assert.equal((await handler(request(batch))).status, 200);
  const limited = await handler(request(batch));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(limited.headers.get("cache-control"), "no-store");
  time += 60001;
  assert.equal((await handler(request(batch))).status, 200);
});

test("client coalesces text, shares duplicates and matches shuffled IDs with partial failures", async () => {
  const calls = [];
  const client = createRemoteTranslationClient(async (_url, init) => {
    const { items } = JSON.parse(init.body);
    calls.push(items);
    return Response.json({
      version: 1,
      results: items
        .map((entry) =>
          entry.text === "Fail"
            ? {
                id: entry.id,
                target: entry.target,
                status: "unavailable",
                durationMs: 0,
              }
            : {
                ...success(entry),
                translation: entry.text === "First" ? "第一" : "第二",
              },
        )
        .reverse(),
    });
  }, 1);
  const first = client.request("First", "zh-CN");
  assert.equal(client.request("First", "zh-CN"), first);
  const results = await Promise.allSettled([
    first,
    client.request("Second", "zh-CN"),
    client.request("Fail", "zh-CN"),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 3);
  assert.equal(results[0].value.translation, "第一");
  assert.equal(results[1].value.translation, "第二");
  assert.equal(results[2].status, "rejected");
});

test("client chunks request bounds and rejects corrupt or oversized response bodies", async () => {
  const calls = [];
  const client = createRemoteTranslationClient(async (_url, init) => {
    const { items } = JSON.parse(init.body);
    calls.push(items);
    return Response.json({ version: 1, results: items.map(success) });
  }, 1);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      client.request(String(i) + "x".repeat(3998), "zh-CN"),
    ),
  );
  assert.ok(
    calls.every(
      (items) =>
        items.length <= 8 &&
        items.reduce((n, entry) => n + entry.text.length, 0) <= 12000,
    ),
  );
  for (const payload of [
    { version: 1, results: [] },
    { version: 2, results: [] },
  ]) {
    const corrupt = createRemoteTranslationClient(
      async () => Response.json(payload),
      1,
    );
    await assert.rejects(corrupt.request("Hello", "zh-CN"));
  }
  const large = createRemoteTranslationClient(
    async () =>
      new Response("x".repeat(256 * 1024 + 1), {
        headers: { "Content-Type": "application/json" },
      }),
    1,
  );
  await assert.rejects(large.request("Hello", "zh-CN"));
});

test("browser transport → HTTP validation → busy NAS fallback → normalized response", async () => {
  let nasCalls = 0;
  const gateway = createTranslationGateway(
    createTranslationProviders(
      { KJCH_AI_SERVICES_API_URL: "https://nas.example" },
      async (url) => {
        if (String(url).startsWith("https://nas.example")) {
          nasCalls++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return Response.json({ response: "你好", done: true });
        }
        return Response.json(["备用译文"]);
      },
    ),
  );
  const handler = createTranslationHandler(gateway.translateBatch);
  const client = createRemoteTranslationClient(
    (_url, init) =>
      handler(new Request("http://localhost/api/translate", init)),
    1,
  );
  const results = await Promise.all([
    client.request("First", "zh-CN"),
    client.request("Second", "zh-CN"),
  ]);
  assert.equal(nasCalls, 1);
  assert.deepEqual(
    results.map(({ provider }) => provider),
    ["ollama", "dict-chrome-ex"],
  );
});

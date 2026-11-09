import assert from "node:assert/strict";
import test from "node:test";
import { createTranslationGateway } from "../../src/lib/translation/gateway.ts";
import { createRemoteTranslationClient } from "../../src/lib/translation/client.ts";
import { createTranslationHandler } from "../../src/lib/translation/handler.ts";
import { createTranslationQueue } from "../../src/lib/translation/queue.ts";
import { createMemoryTranslationState } from "../../src/lib/translation/state-store.ts";
import { createTranslationScheduler } from "../../src/lib/translation/scheduler.ts";

const item = (text) => ({ id: text, text, target: "zh-CN" });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
const node = (translate) => ({
  id: "ollama",
  translate,
  concurrency: 1,
  timeoutMs: 500,
  slowMs: 1,
  cooldownMs: 1000,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("queued work can reuse a result completed by another mode without renewing its TTL", async () => {
  const held = deferred(),
    started = deferred();
  let time = 1000,
    targetCalls = 0;
  const gateway = createTranslationGateway(
    [
      {
        ...node(async ({ text }) => {
          if (text === "hold") {
            started.resolve();
            await held.promise;
          }
          if (text === "target") targetCalls++;
          return "自建译文";
        }),
        concurrency: 2,
        slowMs: 10000,
      },
    ],
    undefined,
    () => time,
  );
  await gateway.translate(item("warm"));
  const head = gateway.translate(item("hold"), { mode: "ollama" });
  await started.promise;
  const queued = gateway.translate(item("target"), { mode: "ollama" });
  await gateway.translate(item("target"));
  time += 100;
  held.resolve();
  await head;
  assert.equal((await queued).cache, "hit");
  assert.equal(targetCalls, 1);
  time = 1001 + 7 * 24 * 60 * 60 * 1000;
  assert.equal((await gateway.translate(item("target"))).cache, "miss");
  assert.equal(targetCalls, 2);
});

test("manual HTTP batches queue FIFO through a single slow NAS without capacity failures", async () => {
  let active = 0,
    maximum = 0;
  const order = [];
  const gateway = createTranslationGateway([
    node(async ({ text }) => {
      maximum = Math.max(maximum, ++active);
      order.push(text);
      await tick();
      active--;
      return `自建译文 ${text}`;
    }),
  ]);
  const handler = createTranslationHandler(gateway.translateBatch);
  const response = await handler(
    new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "ollama",
        items: Array.from({ length: 8 }, (_, i) => item(`item${i}`)),
      }),
    }),
  );
  const { results } = await response.json();
  assert.equal(maximum, 1);
  assert.deepEqual(
    order,
    Array.from({ length: 8 }, (_, i) => `item${i}`),
  );
  assert.ok(
    results.every(
      (result) =>
        result.status === "translated" && result.provider === "ollama",
    ),
  );
});

test("manual workers wait for a shared permit while automatic work remains fail-fast", async () => {
  const store = createMemoryTranslationState();
  const held = deferred(),
    started = deferred();
  let active = 0,
    maximum = 0;
  const nodes = [
    node(async ({ text }) => {
      maximum = Math.max(maximum, ++active);
      if (text === "held") {
        started.resolve();
        await held.promise;
      } else await tick();
      active--;
      return "自建译文";
    }),
  ];
  const one = createTranslationGateway(nodes, undefined, Date.now, store);
  const two = createTranslationGateway(
    nodes,
    undefined,
    Date.now,
    store,
    undefined,
    { pollMs: 1 },
  );
  const original = one.translate(item("held"));
  await started.promise;
  const queued = two.translate(item("manual"), { mode: "ollama" });
  assert.equal((await two.translate(item("automatic"))).status, "unavailable");
  held.resolve();
  assert.equal((await original).status, "translated");
  assert.equal((await queued).status, "translated");
  assert.equal(maximum, 1);
  assert.equal(store.snapshot("ollama").health.consecutiveFailures, 0);
});

test("bounded queue expiry and overflow never execute discarded jobs", async () => {
  const queue = createTranslationQueue(1, 1, 15),
    held = deferred();
  let calls = 0;
  const first = queue.run(() => held.promise);
  const waiting = queue.run(async () => {
    calls++;
  });
  const expired = assert.rejects(waiting);
  await assert.rejects(
    queue.run(async () => {
      calls++;
    }),
  );
  await expired;
  held.resolve("done");
  await first;
  await tick();
  assert.equal(calls, 0);
  assert.equal(await queue.run(async () => "recovered"), "recovered");
});

test("browser manual bursts serialize, deduplicate and abandon obsolete queued requests", async () => {
  let running = 0,
    maximum = 0,
    queued = 0;
  const texts = [];
  const client = createRemoteTranslationClient(async (url, init) => {
    assert.equal(url, "/api/translate");
    const { items, mode } = JSON.parse(init.body);
    assert.equal(mode, "ollama");
    maximum = Math.max(maximum, ++running);
    texts.push(items[0].text);
    await tick();
    running--;
    return Response.json({
      version: 1,
      results: items.map(({ id, target, text }) => ({
        id,
        target,
        status: "translated",
        provider: "ollama",
        cache: "miss",
        durationMs: 5,
        translation: `自建译文 ${text}`,
      })),
    });
  }, 0);
  const first = client.request("first", "zh-CN", "ollama");
  assert.equal(client.request("first", "zh-CN", "ollama"), first);
  const obsolete = client.request("obsolete", "zh-CN", "ollama", {
    canStart: () => false,
  });
  const rejected = assert.rejects(obsolete, { name: "AbortError" });
  const rest = Array.from({ length: 7 }, (_, i) =>
    client.request(`text${i}`, "zh-CN", "ollama", { onQueued: () => queued++ }),
  );
  const results = await Promise.all([first, ...rest]);
  await rejected;
  assert.equal(maximum, 1);
  assert.equal(queued, 7);
  assert.equal(texts.length, 8);
  assert.ok(results.every((result) => result.provider === "ollama"));
  assert.ok(!texts.includes("obsolete"));
});

test("automatic spillover finishes on Google while NAS is still running", async () => {
  const held = deferred(),
    started = deferred();
  let nasDone = false,
    nasCalls = 0,
    googleCalls = 0;
  const client = createRemoteTranslationClient(async (url, init) => {
    if (url === "/api/translate") {
      nasCalls++;
      started.resolve();
      await held.promise;
      nasDone = true;
      const { items } = JSON.parse(init.body);
      return Response.json({
        version: 1,
        results: items.map(({ id, target }) => ({
          id,
          target,
          status: "translated",
          provider: "ollama",
          cache: "miss",
          durationMs: 5,
          translation: "自建译文",
        })),
      });
    }
    googleCalls++;
    assert.equal(init.mode, "cors");
    assert.equal(init.credentials, "omit");
    return Response.json(
      String(url).includes("/single?")
        ? [[["谷歌译文", "source"]]]
        : ["谷歌译文"],
    );
  }, 0);
  const first = client.request("first", "zh-CN");
  await started.promise;
  const other = await Promise.all(
    ["second", "third", "fourth"].map((text) => client.request(text, "zh-CN")),
  );
  assert.equal(nasDone, false);
  assert.equal(nasCalls, 1);
  assert.equal(googleCalls, 3);
  assert.ok(other.every((result) => result.provider !== "ollama"));
  held.resolve();
  assert.equal((await first).provider, "ollama");
});

test("Google outages let automatic spillover wait for NAS instead of failing due to load", async () => {
  const gateway = createTranslationGateway([
    node(async () => {
      await tick();
      return "自建译文";
    }),
  ]);
  const handler = createTranslationHandler(gateway.translateBatch);
  const client = createRemoteTranslationClient(
    (url, init) =>
      url === "/api/translate"
        ? handler(new Request("http://localhost/api/translate", init))
        : Promise.reject(TypeError("offline")),
    0,
  );
  const results = await Promise.all(
    ["first", "second", "third"].map((text) => client.request(text, "zh-CN")),
  );
  assert.ok(results.every((result) => result.provider === "ollama"));
});

test("a manual detail keeps scheduler-shared queued work alive after its preview leaves", async () => {
  const held = deferred(),
    started = deferred();
  const fetched = [];
  const client = createRemoteTranslationClient(async (_url, init) => {
    const { items } = JSON.parse(init.body);
    fetched.push(items[0].text);
    if (items[0].text === "hold") {
      started.resolve();
      await held.promise;
    }
    return Response.json({
      version: 1,
      results: items.map(({ id, target }) => ({
        id,
        target,
        status: "translated",
        translation: "共享译文",
        provider: "ollama",
        cache: "miss",
        durationMs: 1,
      })),
    });
  }, 0);
  const first = client.request("hold", "zh-CN", "ollama");
  await started.promise;
  let previewVisible = true;
  let detailStarted = 0;
  const scheduler = createTranslationScheduler();
  const preview = scheduler.request(
    "shared",
    (callbacks) => client.request("same text", "zh-CN", "ollama", callbacks),
    false,
    { canStart: () => previewVisible },
  );
  const detail = scheduler.request(
    "shared",
    () => {
      throw Error("Must reuse queued translation");
    },
    true,
    { canStart: () => true, onStarted: () => detailStarted++ },
  );
  previewVisible = false;
  held.resolve();
  await first;
  assert.equal((await detail).translation, "共享译文");
  assert.equal((await preview).translation, "共享译文");
  assert.equal(detailStarted, 1);
  assert.deepEqual(fetched, ["hold", "same text"]);
});

test("remote deduplication aggregates consumers and cancels only orphaned queued work", async () => {
  const held = deferred(),
    started = deferred();
  const fetched = [];
  const client = createRemoteTranslationClient(async (_url, init) => {
    const { items } = JSON.parse(init.body);
    fetched.push(items[0].text);
    if (items[0].text === "hold") {
      started.resolve();
      await held.promise;
    }
    return Response.json({
      version: 1,
      results: items.map(({ id, target }) => ({
        id,
        target,
        status: "translated",
        translation: "共享译文",
        provider: "ollama",
        cache: "miss",
        durationMs: 1,
      })),
    });
  }, 0);
  const head = client.request("hold", "zh-CN", "ollama");
  await started.promise;
  let visible = true,
    mounted = true;
  const preview = client.request("shared", "zh-CN", "ollama", {
    canStart: () => visible,
  });
  const detail = client.request("shared", "zh-CN", "ollama", {
    canStart: () => mounted,
  });
  const abandoned = client.request("abandoned", "zh-CN", "ollama", {
    canStart: () => visible,
  });
  client.request("abandoned", "zh-CN", "ollama", { canStart: () => visible });
  const rejected = assert.rejects(abandoned, { name: "AbortError" });
  visible = false;
  held.resolve();
  await head;
  assert.equal(preview, detail);
  assert.equal((await detail).provider, "ollama");
  await rejected;
  mounted = false;
  assert.deepEqual(fetched, ["hold", "shared"]);
});

test("manual clients preserve HTTP Retry-After hints instead of retrying rate limits early", async () => {
  const client = createRemoteTranslationClient(
    async () =>
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    0,
  );
  await assert.rejects(
    client.request("Hello", "zh-CN", "ollama"),
    (error) => error.retryAfterMs === 120000,
  );
});

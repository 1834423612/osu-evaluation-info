import assert from "node:assert/strict";
import test from "node:test";
import { createTranslationGateway } from "../../src/lib/translation/gateway.ts";
import { createTranslationProviders } from "../../src/lib/translation/providers.ts";
import {
  parseTranslationBatch,
  parseTranslationResponse,
} from "../../src/lib/translation/service.ts";

const item = (text = "Hello", target = "zh-CN", id = "one") => ({
  id,
  text,
  target,
});
const node = (id, translate, options = {}) => ({
  id,
  translate,
  timeoutMs: 100,
  slowMs: 50,
  concurrency: 1,
  cooldownMs: 1000,
  ...options,
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("NAS requests use configured model, target prompt, Access headers and non-streaming output", async () => {
  const calls = [];
  const nodes = createTranslationProviders(
    {
      KJCH_AI_SERVICES_API_URL: "https://nas.example/api/generate",
      KJCH_AI_SERVICES_CF_CLIENT_ID: "test-id",
      KJCH_AI_SERVICES_CF_CLIENT_SECRET: "test-secret",
      KJCH_AI_SERVICES_MODEL: "hy-mt-fixed:latest",
    },
    async (url, init) => {
      calls.push({ url: String(url), init, body: JSON.parse(init.body) });
      return Response.json({
        response: calls.length === 1 ? "你好" : "Hello",
        done: true,
      });
    },
  );
  const gateway = createTranslationGateway(nodes);
  assert.equal((await gateway.translate(item())).provider, "ollama");
  assert.equal(
    (await gateway.translate(item("你好", "en"))).translation,
    "Hello",
  );
  assert.equal(calls[0].url, "https://nas.example/api/generate");
  assert.equal(calls[0].init.headers["CF-Access-Client-Secret"], "test-secret");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].body.model, "hy-mt-fixed:latest");
  assert.equal(calls[0].body.stream, false);
  assert.match(
    calls[0].body.prompt,
    /^将以下文本翻译为简体中文.*不要额外解释：\n\nHello$/,
  );
  assert.match(calls[1].body.prompt, /^将以下文本翻译为英文.*\n\n你好$/);
});

test("defaults to HY-MT and never attaches NAS credentials to Google fallbacks", async () => {
  const calls = [];
  const gateway = createTranslationGateway(
    createTranslationProviders(
      {
        KJCH_AI_SERVICES_API_URL: "https://nas.example",
        KJCH_AI_SERVICES_CF_CLIENT_ID: "id",
        KJCH_AI_SERVICES_CF_CLIENT_SECRET: "secret",
      },
      async (url, init) => {
        calls.push({ url: String(url), init });
        return calls.length === 1
          ? new Response("Access login", { status: 403 })
          : Response.json(["你好"]);
      },
    ),
  );
  assert.equal((await gateway.translate(item())).provider, "dict-chrome-ex");
  assert.equal(
    JSON.parse(calls[0].init.body).model,
    "HY-MT1.5-1.8B-GGUF:Q4_K_M",
  );
  assert.equal(calls[1].init.headers["CF-Access-Client-Id"], undefined);
});

test("unconfigured, invalid URLs and incomplete credentials disable only NAS", () => {
  for (const env of [
    {},
    { KJCH_AI_SERVICES_API_URL: "file:///tmp/secret" },
    {
      KJCH_AI_SERVICES_API_URL: "https://nas.example",
      KJCH_AI_SERVICES_CF_CLIENT_ID: "id",
    },
  ]) {
    assert.deepEqual(
      createTranslationProviders(env).map(({ id }) => id),
      ["dict-chrome-ex", "clients5", "gtx"],
    );
  }
});

test("overflow skips a busy NAS while deduplicated callers share one inference", async () => {
  const held = deferred();
  let nasCalls = 0;
  const observations = [];
  const gateway = createTranslationGateway(
    [
      node("ollama", () => {
        nasCalls++;
        return held.promise;
      }),
      node("gtx", async () => "备用译文"),
    ],
    (event) => observations.push(event),
  );
  const first = gateway.translate(item());
  const duplicate = gateway.translate(item("Hello", "zh-CN", "duplicate"));
  assert.equal((await gateway.translate(item("Other text"))).provider, "gtx");
  held.resolve("你好");
  const [a, b] = await Promise.all([first, duplicate]);
  assert.equal(nasCalls, 1);
  assert.equal(b.id, "duplicate");
  assert.equal(b.cache, "shared");
  assert.equal(a.cache, "miss");
  assert.equal((await gateway.translate(item())).cache, "hit");
  assert.ok(observations.some(({ outcome }) => outcome === "busy"));
});

test("slow successes divert subsequent requests and a single healthy probe restores NAS", async () => {
  let time = 1000;
  let slow = true;
  let calls = 0;
  const observations = [];
  const gateway = createTranslationGateway(
    [
      node("ollama", async () => {
        calls++;
        time += slow ? 60 : 10;
        return "本地译文";
      }),
      node("gtx", async () => "备用译文"),
    ],
    (event) => observations.push(event),
    () => time,
  );
  assert.equal((await gateway.translate(item("First"))).provider, "ollama");
  assert.equal((await gateway.translate(item("Second"))).provider, "gtx");
  assert.equal(calls, 1);
  time += 1001;
  slow = false;
  assert.equal((await gateway.translate(item("Third"))).provider, "ollama");
  assert.equal((await gateway.translate(item("Fourth"))).provider, "ollama");
  assert.ok(observations.some(({ outcome }) => outcome === "circuit"));
});

test("times out a hanging NAS and diverts traffic until cooldown ends", async () => {
  const observations = [];
  let aborted = false;
  const gateway = createTranslationGateway(
    [
      node(
        "ollama",
        (_item, signal) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(signal.reason);
            });
          }),
        { timeoutMs: 10 },
      ),
      node("gtx", async () => "备用译文"),
    ],
    (event) => observations.push(event),
  );
  assert.equal((await gateway.translate(item())).provider, "gtx");
  assert.equal(aborted, true);
  assert.equal((await gateway.translate(item("Other"))).provider, "gtx");
  assert.ok(observations.some(({ outcome }) => outcome === "timeout"));
  assert.ok(observations.some(({ outcome }) => outcome === "circuit"));
});

test("two failures open a circuit, partial batches survive and all-failed results stay structured", async () => {
  let calls = 0;
  const gateway = createTranslationGateway([
    node("ollama", async () => {
      calls++;
      throw Error("private upstream details");
    }),
    node("gtx", async ({ text }) => {
      if (text === "Broken") throw Error("offline");
      return "译文";
    }),
  ]);
  await gateway.translate(item("First"));
  await gateway.translate(item("Second"));
  const result = await gateway.translateBatch([
    item("Good", "zh-CN", "good"),
    item("Broken", "zh-CN", "bad"),
  ]);
  assert.equal(calls, 2);
  assert.equal(result[0].status, "translated");
  assert.equal(result[1].status, "unavailable");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("bounds batches and supports only Chinese/English with unique stable IDs", () => {
  assert.equal(parseTranslationBatch({ items: [item(), item()] }), null);
  assert.equal(parseTranslationBatch({ items: [item("x", "ja")] }), null);
  assert.equal(
    parseTranslationBatch({
      items: Array.from({ length: 9 }, (_, i) => item("x", "en", String(i))),
    }),
    null,
  );
  assert.equal(
    parseTranslationBatch({
      items: Array.from({ length: 4 }, (_, i) =>
        item("x".repeat(4000), "en", String(i)),
      ),
    }),
    null,
  );
  assert.deepEqual(parseTranslationBatch({ text: "你好", target: "en" }), [
    item("你好", "en", "0"),
  ]);
  assert.equal(
    parseTranslationBatch({ items: [item("Hello", "zh")] })[0].target,
    "zh-CN",
  );
});

test("Ollama output must be complete, bounded, changed and free of truncation", () => {
  assert.equal(
    parseTranslationResponse(
      { response: "你好", done: true },
      "ollama",
      "Hello",
    ),
    "你好",
  );
  for (const payload of [
    { response: "你好", done: false },
    { response: "你好", done: true, done_reason: "length" },
    { response: "Hello", done: true },
    { response: "x".repeat(8001), done: true },
    { error: "offline" },
  ])
    assert.equal(parseTranslationResponse(payload, "ollama", "Hello"), null);
});

test("upstream body size and slow streamed bodies are bounded through fallback", async () => {
  let cancelled = false;
  const providers = createTranslationProviders(
    { KJCH_AI_SERVICES_API_URL: "https://nas.example" },
    async (url) => {
      if (String(url).startsWith("https://nas.example"))
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"response":"'));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      return Response.json(["你好"]);
    },
  );
  providers[0].timeoutMs = 10;
  const result = await createTranslationGateway(providers).translate(item());
  assert.equal(result.provider, "dict-chrome-ex");
  assert.equal(cancelled, true);
  const large = createTranslationGateway(
    createTranslationProviders(
      {},
      async () =>
        new Response("x".repeat(65537), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  assert.equal((await large.translate(item())).status, "unavailable");
});

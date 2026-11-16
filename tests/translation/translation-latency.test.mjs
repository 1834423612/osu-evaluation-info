import assert from "node:assert/strict";
import test from "node:test";
import { createRemoteTranslationClient } from "../../src/lib/translation/client.ts";
import { translateInBrowser } from "../../src/lib/translation/browser.ts";
import { AUTO_TRANSLATION_STAGE_MS } from "../../src/lib/translation/service.ts";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const result = (init) =>
  Response.json({
    version: 1,
    results: JSON.parse(init.body).items.map(({ id, target }) => ({
      id,
      target,
      status: "translated",
      provider: "ollama",
      cache: "hit",
      durationMs: 1,
      translation: "NAS translation 中文",
    })),
  });

test("first automatic request can finish before a cold NAS response", async () => {
  const held = deferred();
  let nasFinished = false,
    nasCalls = 0,
    googleCalls = 0;
  const client = createRemoteTranslationClient(
    async (url, init) => {
      if (url === "/api/translate") {
        nasCalls++;
        await held.promise;
        nasFinished = true;
        return result(init);
      }
      googleCalls++;
      return Response.json(["Google translation 中文"]);
    },
    0,
    undefined,
    5,
  );
  const translated = await client.request("Hello", "zh-CN");
  assert.equal(translated.provider, "dict-chrome-ex");
  assert.equal(nasFinished, false);
  // The still-running NAS lane cannot admit duplicate inference for another item.
  await client.request("Second", "zh-CN");
  assert.equal(nasCalls, 1);
  assert.equal(googleCalls, 2);
  held.resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));
});

test("fast NAS responses never start the delayed Google request", async () => {
  let googleCalls = 0;
  const client = createRemoteTranslationClient(
    async (url, init) => {
      if (url === "/api/translate") return result(init);
      googleCalls++;
      throw Error("Unexpected Google call");
    },
    0,
    undefined,
    5,
  );
  assert.equal((await client.request("Hello", "zh-CN")).provider, "ollama");
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(googleCalls, 0);
});

test("failed hedged Google requests still allow a healthy slow NAS result", async () => {
  const held = deferred(),
    googleStarted = deferred();
  const client = createRemoteTranslationClient(
    async (url, init) => {
      if (url === "/api/translate") {
        await held.promise;
        return result(init);
      }
      googleStarted.resolve();
      throw Error("Offline Google");
    },
    0,
    undefined,
    5,
  );
  const pending = client.request("Hello", "zh-CN");
  await googleStarted.promise;
  held.resolve();
  assert.equal((await pending).provider, "ollama");
});

test("manual NAS waits for its selected provider without hedging", async () => {
  const held = deferred();
  let googleCalls = 0;
  const client = createRemoteTranslationClient(
    async (url, init) => {
      if (url === "/api/translate") {
        await held.promise;
        return result(init);
      }
      googleCalls++;
      return Response.json(["Google translation 中文"]);
    },
    0,
    undefined,
    1,
  );
  const pending = client.request("Hello", "zh-CN", "ollama");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(googleCalls, 0);
  held.resolve();
  assert.equal((await pending).provider, "ollama");
});

test("a bounded on-device attempt cancels initialization and never downloads a model", async () => {
  let creates = 0;
  assert.equal(AUTO_TRANSLATION_STAGE_MS, 1500);
  await assert.rejects(
    translateInBrowser(
      "Hello",
      "en",
      "zh-CN",
      {
        availability: () => new Promise(() => {}),
        create: async () => {
          creates++;
          throw Error("not ready");
        },
      },
      5,
    ),
    /timed out/,
  );
  assert.equal(creates, 0);
});

test("orphaned consumers do not send text to a delayed fallback", async () => {
  const held = deferred(),
    started = deferred();
  let relevant = true,
    googleCalls = 0;
  const client = createRemoteTranslationClient(
    async (url, init) => {
      if (url === "/api/translate") {
        started.resolve();
        await held.promise;
        return result(init);
      }
      googleCalls++;
      return Response.json(["Google translation 中文"]);
    },
    0,
    undefined,
    5,
  );
  const pending = client.request("Hello", "zh-CN", "auto", {
    canStart: () => relevant,
  });
  await started.promise;
  relevant = false;
  await new Promise((resolve) => setTimeout(resolve, 15));
  held.resolve();
  await pending;
  assert.equal(googleCalls, 0);
});

test("hedging notifies start once and observes late NAS failures", async () => {
  const held = deferred();
  let starts = 0;
  const client = createRemoteTranslationClient(
    async (url) => {
      if (url === "/api/translate") {
        await held.promise;
        throw Error("Late NAS failure");
      }
      return Response.json(["Google translation 中文"]);
    },
    0,
    undefined,
    5,
  );
  const translated = await client.request("Hello", "zh-CN", "auto", {
    onStarted: () => starts++,
  });
  assert.equal(translated.provider, "dict-chrome-ex");
  assert.equal(starts, 1);
  held.resolve();
  await new Promise((resolve) => setTimeout(resolve, 5));
});

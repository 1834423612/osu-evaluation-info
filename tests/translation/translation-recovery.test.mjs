import assert from "node:assert/strict";
import test from "node:test";
import { createTranslationGateway } from "../../src/lib/translation/gateway.ts";
import { createBrowserGoogleFallback } from "../../src/lib/translation/google.ts";
import { createRemoteTranslationClient } from "../../src/lib/translation/client.ts";
import { createTranslationScheduler } from "../../src/lib/translation/scheduler.ts";
import { BROWSER_TRANSLATION_PROVIDERS } from "../../src/lib/translation/service.ts";

const item = (text = "Hello", id = "one") => ({ text, id, target: "zh-CN" });
const node = (translate, options = {}) => ({
  id: "ollama",
  translate,
  timeoutMs: 10,
  slowMs: 100,
  concurrency: 3,
  cooldownMs: 1000,
  ...options,
});

test("temporary NAS failures expire and the same input can probe and recover", async () => {
  let time = 1000,
    calls = 0;
  const gateway = createTranslationGateway(
    [
      node(async () => {
        if (++calls <= 2) throw Error("temporary outage");
        return "已恢复";
      }),
    ],
    () => {},
    () => time,
  );
  assert.equal((await gateway.translate(item())).status, "unavailable");
  assert.equal((await gateway.translate(item())).status, "unavailable");
  const cooled = await gateway.translate(item());
  assert.equal(cooled.status, "unavailable");
  assert.equal(calls, 2);
  assert.equal(cooled.retryAfterMs, 1000);
  time += 1001;
  const recovered = await gateway.translate(item());
  assert.equal(recovered.provider, "ollama");
  assert.equal(recovered.translation, "已恢复");
  assert.equal(calls, 3);
});

test("an orphaned request cannot reserve NAS forever and recovery admits one probe", async () => {
  let time = 1000,
    calls = 0,
    release;
  const gateway = createTranslationGateway(
    [
      node(() => {
        calls++;
        if (calls === 1) return new Promise(() => {});
        return new Promise((resolve) => {
          release = resolve;
        });
      }),
    ],
    () => {},
    () => time,
  );
  assert.equal((await gateway.translate(item())).status, "unavailable");
  assert.equal(
    (await gateway.translate(item("During cooldown"))).status,
    "unavailable",
  );
  assert.equal(calls, 1);
  time += 1011;
  const probe = gateway.translate(item("Recovery"));
  const sibling = await gateway.translate(item("Concurrent recovery"));
  assert.equal(sibling.status, "unavailable");
  assert.equal(calls, 2);
  release("已恢复");
  assert.equal((await probe).provider, "ollama");
});

test("Google cooldowns are per device and provider, and honor finite Retry-After", async () => {
  let time = 1000;
  const calls = [];
  let recovered = false;
  const fetcher = async (url, init) => {
    calls.push(String(url));
    assert.equal(init.mode, "cors");
    assert.equal(init.credentials, "omit");
    if (
      String(url).includes("translate_a/t?") &&
      String(url).startsWith("https://translate.googleapis.com") &&
      !recovered
    )
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "10" },
      });
    return Response.json(["设备译文"]);
  };
  const firstDevice = createBrowserGoogleFallback(fetcher, () => time);
  assert.equal((await firstDevice(item())).provider, "clients5");
  assert.equal((await firstDevice(item("Another"))).provider, "clients5");
  assert.equal(calls.length, 3);
  recovered = true;
  const secondDevice = createBrowserGoogleFallback(fetcher, () => time);
  assert.equal((await secondDevice(item())).provider, "dict-chrome-ex");
  time += 10001;
  assert.equal((await firstDevice(item())).provider, "dict-chrome-ex");
});

test("all Google providers remain independently retryable after transient errors", async () => {
  let time = 1000,
    calls = 0,
    healthy = false;
  const translate = createBrowserGoogleFallback(
    async () => {
      calls++;
      if (!healthy) throw TypeError("temporary CORS/network error");
      return Response.json(["已恢复"]);
    },
    () => time,
  );
  await assert.rejects(translate(item()), { retryAfterMs: 5000 });
  await assert.rejects(translate(item()));
  assert.equal(calls, 3);
  time += 5001;
  healthy = true;
  assert.equal((await translate(item())).translation, "已恢复");
  assert.equal(calls, 4);
});

test("API outage still allows direct browser Google and never follows an arbitrary endpoint", async () => {
  const calls = [];
  const client = createRemoteTranslationClient(async (url, init) => {
    calls.push(String(url));
    if (url === "/api/translate")
      return Response.json({
        version: 1,
        results: [],
        browserFallback: [
          { id: "gtx", endpoint: "https://untrusted.example/steal" },
        ],
      });
    assert.ok(
      BROWSER_TRANSLATION_PROVIDERS.some(({ endpoint }) =>
        String(url).startsWith(endpoint + "?"),
      ),
    );
    assert.equal(init.body, undefined);
    return Response.json(["安全译文"]);
  }, 1);
  assert.equal(
    (await client.request("Hello", "zh-CN")).translation,
    "安全译文",
  );
  assert.equal(
    calls.some((url) => url.includes("untrusted.example")),
    false,
  );
  const offline = createRemoteTranslationClient(async (url) => {
    if (url === "/api/translate") throw Error("site API offline");
    return Response.json(["设备直连"]);
  }, 1);
  assert.equal(
    (await offline.request("Hello", "zh-CN")).translation,
    "设备直连",
  );
});

test("Google fallback success does not bypass NAS on a later request", async () => {
  let healthy = false,
    nasRequests = 0;
  const client = createRemoteTranslationClient(async (url, init) => {
    if (url !== "/api/translate") return Response.json(["备用译文"]);
    nasRequests++;
    const { items } = JSON.parse(init.body);
    return Response.json({
      version: 1,
      results: items.map(({ id, target }) =>
        healthy
          ? {
              id,
              target,
              status: "translated",
              translation: "NAS 已恢复",
              provider: "ollama",
              cache: "miss",
              durationMs: 1,
            }
          : {
              id,
              target,
              status: "unavailable",
              retryAfterMs: 1000,
              durationMs: 1,
            },
      ),
    });
  }, 1);
  assert.equal(
    (await client.request("Hello", "zh-CN")).provider,
    "dict-chrome-ex",
  );
  healthy = true;
  assert.equal((await client.request("Hello", "zh-CN")).provider, "ollama");
  assert.equal(nasRequests, 2);
});

test("browser cache expires so fallback translations cannot pin future requests forever", async () => {
  let time = 1;
  const scheduler = createTranslationScheduler(2, 300, () => time);
  assert.equal(await scheduler.request("same", async () => "Google"), "Google");
  time += 30001;
  assert.equal(
    await scheduler.request("same", async () => "Recovered NAS"),
    "Recovered NAS",
  );
});

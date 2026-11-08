import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserUsageReporter } from "../../src/lib/translation/browser-usage.ts";
import { createTranslationUsageHandler } from "../../src/lib/translation/usage-handler.ts";

const event = {
  provider: "gtx",
  target: "en",
  outcome: "success",
  characters: 20,
  durationMs: 100,
};
const request = (events) =>
  new Request("http://localhost/api/translate/usage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });

test("browser usage reports only bounded metadata and never influences provider health", async () => {
  const recorded = [];
  const handle = createTranslationUsageHandler((value) => recorded.push(value));
  const response = await handle(request([event]));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(recorded, [event]);
  for (const invalid of [
    { ...event, provider: "ollama" },
    { ...event, text: "must not be collected" },
    { ...event, characters: 4001 },
    { ...event, durationMs: 60001 },
    { ...event, outcome: "unknown" },
  ])
    assert.equal((await handle(request([invalid]))).status, 400);
  assert.equal(
    (await handle(request(Array.from({ length: 33 }, () => event)))).status,
    400,
  );
  assert.equal(recorded.length, 1);
});

test("browser counters retain per-client rate limits", async () => {
  const handle = createTranslationUsageHandler(() => {});
  for (let i = 0; i < 3; i++)
    assert.equal(
      (await handle(request(Array.from({ length: 32 }, () => event)))).status,
      204,
    );
  assert.equal(
    (await handle(request(Array.from({ length: 32 }, () => event)))).status,
    429,
  );
});

test("browser reporter coalesces counters into a separate same-origin request", async () => {
  let done;
  const sent = new Promise((resolve) => {
    done = resolve;
  });
  const observe = createBrowserUsageReporter(async (url, init) => {
    assert.equal(url, "/api/translate/usage");
    assert.equal(init.credentials, "same-origin");
    const body = JSON.parse(init.body);
    assert.equal(body.events.length, 2);
    assert.ok(body.events.every((entry) => Object.keys(entry).length === 5));
    done();
    return new Response(null, { status: 204 });
  });
  observe(event);
  observe(event);
  await sent;
});

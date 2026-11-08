import assert from "node:assert/strict";
import test from "node:test";
import { createTranslationScheduler } from "../../src/lib/translation/scheduler.ts";

test("bounds concurrent snippets and deduplicates duplicate previews and details", async () => {
  const scheduler = createTranslationScheduler(2);
  const release = new Map();
  const started = [];
  let running = 0;
  let maxRunning = 0;
  const operation = (key) => () => {
    started.push(key);
    running++;
    maxRunning = Math.max(maxRunning, running);
    return new Promise((resolve) => {
      release.set(key, () => {
        running--;
        resolve(`translated ${key}`);
      });
    });
  };
  const first = scheduler.request("same-text", operation("same-text"));
  const duplicate = scheduler.request("same-text", () => {
    throw new Error("Duplicate text must share the first request.");
  });
  const second = scheduler.request("second", operation("second"));
  const third = scheduler.request("third", operation("third"));
  assert.equal(first, duplicate);
  assert.deepEqual(started, ["same-text", "second"]);
  release.get("same-text")();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["same-text", "second", "third"]);
  release.get("second")();
  release.get("third")();
  await Promise.all([duplicate, second, third]);
  assert.equal(maxRunning, 2);
  assert.equal(
    await scheduler.request("same-text", () => {
      throw new Error("A successful translation must be cached.");
    }),
    "translated same-text",
  );
});

test("backs off failed snippets without globally blocking other snippets or manual retries", async () => {
  let time = 1;
  let calls = 0;
  const scheduler = createTranslationScheduler(2, 300, () => time);
  const fail = async () => {
    calls++;
    throw new Error("Offline");
  };
  for (const key of ["a", "b", "c"])
    await assert.rejects(scheduler.request(key, fail));
  await assert.rejects(scheduler.request("a", fail));
  await assert.rejects(scheduler.request("d", fail));
  assert.equal(calls, 4);
  assert.equal(
    await scheduler.request("a", async () => "manual recovery", true),
    "manual recovery",
  );
  time += 5001;
  assert.equal(
    await scheduler.request("d", async () => "recovered"),
    "recovered",
  );
});

test("leaving the visible viewport does not count as a provider failure", async () => {
  const scheduler = createTranslationScheduler();
  for (const key of ["offscreen-a", "offscreen-b", "offscreen-c"])
    await assert.rejects(
      scheduler.request(key, async () => {
        throw new DOMException("No longer visible", "AbortError");
      }),
    );
  assert.equal(
    await scheduler.request("visible", async () => "translated"),
    "translated",
  );
});

test("cached translations retain their actual provider until fresh work replaces them", async () => {
  let time = 1;
  const scheduler = createTranslationScheduler(2, 300, () => time);
  const googleResult = { translation: "谷歌译文", provider: "clients5" };
  await scheduler.request("same-review", async () => googleResult);
  const reused = await scheduler.request("same-review", async () => {
    throw Error("A cached translation must retain its original source.");
  });
  assert.equal(reused.provider, "clients5");
  assert.equal(reused.translation, "谷歌译文");
  time += 30001;
  const recovered = await scheduler.request("same-review", async () => ({
    translation: "自建译文",
    provider: "ollama",
  }));
  assert.equal(recovered.provider, "ollama");
});

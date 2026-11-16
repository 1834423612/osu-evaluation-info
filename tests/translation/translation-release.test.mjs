import assert from "node:assert/strict";
import test from "node:test";
import { createTranslationGateway } from "../../src/lib/translation/gateway.ts";
import { createMemoryTranslationState } from "../../src/lib/translation/state-store.ts";

const item = { id: "one", text: "Hello", target: "zh-CN" };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function setup(translate, finishOverride) {
  const memory = createMemoryTranslationState();
  let releases = 0,
    finishes = 0;
  const store = {
    ...memory,
    finish: async (...args) => {
      finishes++;
      return finishOverride
        ? finishOverride(memory, ...args)
        : memory.finish(...args);
    },
    release: async (...args) => {
      releases++;
      await memory.release(...args);
    },
  };
  const gateway = createTranslationGateway(
    [
      {
        id: "ollama",
        translate,
        concurrency: 1,
        timeoutMs: 10,
        slowMs: 1000,
        cooldownMs: 1000,
      },
    ],
    undefined,
    Date.now,
    store,
  );
  return {
    gateway,
    memory,
    releases: () => releases,
    finishes: () => finishes,
  };
}
test("confirmed successful finish returns without another release transaction", async () => {
  const state = setup(async () => "Chinese 中文");
  assert.equal((await state.gateway.translate(item)).status, "translated");
  assert.equal(state.finishes(), 1);
  assert.equal(state.releases(), 0);
  assert.ok(
    state.memory
      .snapshot("ollama")
      .attempts.every((entry) => entry.releasedAt !== null),
  );
});

test("confirmed failed and settled inference also avoids redundant release", async () => {
  const state = setup(async () => {
    throw Error("provider failed");
  });
  assert.equal((await state.gateway.translate(item)).status, "unavailable");
  assert.equal(state.finishes(), 1);
  assert.equal(state.releases(), 0);
  assert.ok(
    state.memory
      .snapshot("ollama")
      .attempts.every((entry) => entry.releasedAt !== null),
  );
});

test("failed finish persistence still attempts the existing final release", async () => {
  const state = setup(
    async () => "Chinese 中文",
    async () => {
      throw Error("database unavailable");
    },
  );
  assert.equal((await state.gateway.translate(item)).status, "unavailable");
  assert.equal(state.finishes(), 2);
  assert.equal(state.releases(), 1);
});

test("unconfirmed finish keeps the conservative release path", async () => {
  const state = setup(
    async () => "Chinese 中文",
    async (memory, ...args) => {
      await memory.finish(...args);
      return false;
    },
  );
  assert.equal((await state.gateway.translate(item)).status, "unavailable");
  assert.equal(state.releases(), 1);
});

test("timed-out inference retains capacity and releases after late settlement", async () => {
  const held = deferred();
  const state = setup(() => held.promise);
  assert.equal((await state.gateway.translate(item)).status, "unavailable");
  assert.equal(state.releases(), 0);
  assert.ok(
    state.memory
      .snapshot("ollama")
      .attempts.some((entry) => entry.releasedAt === null),
  );
  held.resolve("Late Chinese 中文");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.releases(), 1);
  assert.ok(
    state.memory
      .snapshot("ollama")
      .attempts.every((entry) => entry.releasedAt !== null),
  );
});

test("settlement during a pending timeout finish still gets a final release", async () => {
  const held = deferred(),
    finishing = deferred(),
    persist = deferred();
  const state = setup(
    () => held.promise,
    async (memory, ...args) => {
      assert.equal(args[3], false);
      finishing.resolve();
      await persist.promise;
      return memory.finish(...args);
    },
  );
  const pending = state.gateway.translate(item);
  await finishing.promise;
  held.resolve("Late Chinese 中文");
  await new Promise((resolve) => setImmediate(resolve));
  persist.resolve();
  assert.equal((await pending).status, "unavailable");
  assert.equal(state.releases(), 1);
  assert.ok(
    state.memory
      .snapshot("ollama")
      .attempts.every((entry) => entry.releasedAt !== null),
  );
});

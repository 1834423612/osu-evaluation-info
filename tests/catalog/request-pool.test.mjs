import assert from "node:assert/strict";
import test from "node:test";
import {
  createRequestPool,
  RequestQueueFullError,
} from "../../src/lib/catalog/request-pool.ts";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("spaces requests and never exceeds the shared concurrency limit", async () => {
  const pool = createRequestPool({ concurrency: 2, minStartIntervalMs: 15 });
  let active = 0,
    max = 0;
  const starts = [];
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      pool.read(String(i), async () => {
        active++;
        max = Math.max(max, active);
        starts.push(Date.now());
        await sleep(35);
        active--;
        return i;
      }),
    ),
  );
  assert.equal(max, 2);
  assert.ok(starts.slice(1).every((time, i) => time - starts[i] >= 12));
});

test("coalesces identical readers and cancelling one does not cancel another", async () => {
  const pool = createRequestPool({ minStartIntervalMs: 0 });
  let finish,
    calls = 0,
    sourceSignal;
  const abort = new AbortController();
  const run = (signal) => {
    calls++;
    sourceSignal = signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = pool.read("same", run, { signal: abort.signal });
  const rejected = assert.rejects(first, { name: "AbortError" });
  const second = pool.read("same", run);
  await sleep(5);
  abort.abort();
  await rejected;
  assert.equal(sourceSignal.aborted, false);
  finish(42);
  assert.equal(await second, 42);
  assert.equal(calls, 1);
});

test("foreground work precedes queued background work, and background cancellation is scoped", async () => {
  const pool = createRequestPool({ concurrency: 1, minStartIntervalMs: 0 });
  let release;
  const order = [];
  const active = pool.read(
    "hold",
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await sleep(5);
  const background = pool.read(
    "background",
    async () => {
      order.push("background");
      return 1;
    },
    { priority: 10 },
  );
  const rejected = assert.rejects(background, { name: "AbortError" });
  const foreground = pool.read("foreground", async () => {
    order.push("foreground");
    return 2;
  });
  pool.cancelBackground();
  release(0);
  await active;
  await rejected;
  assert.equal(await foreground, 2);
  assert.deepEqual(order, ["foreground"]);
});

test("honors a backoff already applied while another start was scheduled", async () => {
  const pool = createRequestPool({ minStartIntervalMs: 15 });
  const start = Date.now();
  pool.backoff(65);
  let observed;
  await pool.read("later", async () => {
    observed = Date.now();
    return true;
  });
  assert.ok(observed - start >= 60);
});

test("rejects a saturated queue instead of creating unbounded upstream work", async () => {
  const pool = createRequestPool({ maxQueued: 1, minStartIntervalMs: 0 });
  const first = pool.read("a", async () => 1);
  await assert.rejects(
    pool.read("b", async () => 2),
    RequestQueueFullError,
  );
  await first;
});

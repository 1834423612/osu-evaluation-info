import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDetailRefresh } from "../../src/lib/catalog/detail-refresh.ts";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function course() {
  return {
    id: "course",
    availability: { source: "official", fetchedAt: new Date().toISOString() },
    sections: [
      {
        id: "1",
        enrollmentStatus: "Open",
        enrollmentTotal: 29,
        waitlistTotal: 2,
      },
    ],
  };
}
function setup(fetcher, poll = true, intervalMs = 30000) {
  const document = new EventTarget();
  document.visibilityState = "visible";
  const window = new EventTarget();
  const updates = [];
  const intervals = [];
  const cancelledIntervals = [];
  let tick;
  let cancelled = false;
  const engine = createDetailRefresh({
    course: course(),
    url: "/api/catalog/course",
    onUpdate: (value) => updates.push(value),
    window,
    document,
    fetcher,
    poll,
    intervalMs,
    every(callback, interval) {
      intervals.push(interval);
      tick = callback;
      return interval;
    },
    cancelEvery(interval) {
      assert.ok(interval >= 10000);
      cancelledIntervals.push(interval);
      cancelled = true;
    },
  });
  return {
    engine,
    document,
    window,
    updates,
    intervals,
    cancelledIntervals,
    tick: () => tick?.(),
    get cancelled() {
      return cancelled;
    },
  };
}
const response = () =>
  Response.json({ course: course(), sourceMode: "official" });

describe("visible course detail refresh", () => {
  it("refreshes on open, every 30 seconds, and window focus without caching", async () => {
    let calls = 0;
    const env = setup(async (_url, options) => {
      calls++;
      assert.equal(options.cache, "no-store");
      return response();
    });
    env.engine.start();
    await flush();
    assert.equal(calls, 1);
    assert.equal(env.updates.at(-1).course.availability.source, "official");
    env.tick();
    await flush();
    assert.equal(calls, 2);
    env.window.dispatchEvent(new Event("focus"));
    await flush();
    assert.equal(calls, 3);
    env.engine.stop();
    assert.equal(env.cancelled, true);
    env.window.dispatchEvent(new Event("focus"));
    await flush();
    assert.equal(calls, 3);
  });
  it("never overlaps reads and aborts hidden requests; a late response cannot restore seats", async () => {
    const reads = [];
    const env = setup(
      (_url, options) =>
        new Promise((resolve) => reads.push({ options, resolve })),
    );
    env.engine.start();
    await flush();
    env.tick();
    env.window.dispatchEvent(new Event("focus"));
    assert.equal(reads.length, 1);
    env.document.visibilityState = "hidden";
    env.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(reads[0].options.signal.aborted, true);
    assert.equal(env.updates.at(-1).course.sections[0].enrollmentTotal, null);
    env.tick();
    assert.equal(reads.length, 1);
    env.document.visibilityState = "visible";
    env.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(reads.length, 2);
    reads[1].resolve(response());
    await flush();
    const latest = env.updates.at(-1);
    reads[0].resolve(
      Response.json({
        course: { ...course(), sections: [] },
        sourceMode: "official",
      }),
    );
    await flush();
    assert.equal(env.updates.at(-1), latest);
    env.engine.stop();
  });
  it("clears values on failures and rejects archived enrollment even if it claims provenance", async () => {
    for (const result of [
      new Response("unavailable", { status: 503 }),
      Response.json({
        course: course(),
        sourceMode: "mirror",
        snapshotAt: "2020-01-01",
      }),
    ]) {
      const env = setup(async () => result);
      env.engine.start();
      await flush();
      assert.equal(
        env.updates.at(-1).course.availability.source,
        "unavailable",
      );
      assert.equal(env.updates.at(-1).course.sections[0].enrollmentTotal, null);
      env.engine.stop();
    }
  });
  it("closing aborts the read and ignores a subsequent response", async () => {
    let finish;
    let signal;
    const env = setup((_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    env.engine.start();
    await flush();
    const count = env.updates.length;
    env.engine.stop();
    assert.equal(signal.aborted, true);
    finish(response());
    await flush();
    assert.equal(env.updates.length, count);
  });
  it("reopening creates a fresh request even when prior details were loaded", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return response();
    };
    const first = setup(fetcher, false);
    first.engine.start();
    await flush();
    first.engine.stop();
    const reopened = setup(fetcher, false);
    reopened.engine.start();
    await flush();
    assert.equal(calls, 2);
    reopened.engine.stop();
  });
  it("refreshes once by default and ignores focus, timer, and visibility restoration", async () => {
    let calls = 0;
    const env = setup(async () => {
      calls++;
      return response();
    }, false);
    env.engine.start();
    await flush();
    assert.equal(calls, 1);

    env.window.dispatchEvent(new Event("focus"));
    env.tick();
    await flush();
    assert.equal(calls, 1);

    env.document.visibilityState = "hidden";
    env.document.dispatchEvent(new Event("visibilitychange"));
    env.document.visibilityState = "visible";
    env.document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    assert.equal(calls, 1);

    await env.engine.refresh();
    assert.equal(calls, 2);
    env.engine.stop();
    assert.equal(env.cancelled, false);
  });
  it("starts aggressive refresh immediately when enabled and stops it without another read", async () => {
    let calls = 0;
    const env = setup(async () => {
      calls++;
      return response();
    }, false);
    env.engine.start();
    await flush();
    assert.equal(calls, 1);

    env.engine.setPolling(true);
    await flush();
    assert.equal(calls, 2);
    env.tick();
    await flush();
    assert.equal(calls, 3);

    env.engine.setPolling(false);
    assert.equal(env.cancelled, true);
    env.window.dispatchEvent(new Event("focus"));
    env.tick();
    await flush();
    assert.equal(calls, 3);
    env.engine.stop();
  });
  it("supports a configurable interval with a ten-second minimum", async () => {
    let calls = 0;
    const env = setup(
      async () => {
        calls++;
        return response();
      },
      false,
      8_000,
    );
    env.engine.start();
    await flush();
    env.engine.setPolling(true, 8_000);
    await flush();
    assert.equal(calls, 2);
    env.engine.setPolling(true, 15_000);
    await flush();
    assert.deepEqual(env.intervals, [10_000, 15_000]);
    assert.deepEqual(env.cancelledIntervals, [10_000]);
    assert.equal(calls, 2);
    env.engine.setPolling(false, 15_000);
    assert.deepEqual(env.cancelledIntervals, [10_000, 15_000]);
    env.engine.stop();
  });
});

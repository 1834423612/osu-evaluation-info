import assert from "node:assert/strict";
import test from "node:test";
import {
  createDebugServiceStore,
  DEBUG_RESPONSES_KEY,
  debugFetch,
  debugResponse,
} from "../../src/lib/debug/services.ts";
import { DEFAULT_DEBUG_FLAGS } from "../../src/lib/debug/flags.ts";
import { createCatalogTransport } from "../../src/lib/catalog/browser-transport.ts";

function fixture() {
  const data = new Map();
  const flags = { ...DEFAULT_DEBUG_FLAGS };
  let now = 1000,
    calls = 0;
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const create = () =>
    createDebugServiceStore({
      storage,
      flags: (k) => flags[k],
      capture: () => true,
      now: () => now,
    });
  return {
    data,
    flags,
    create,
    advance: (n) => (now += n),
    load: async () => ({ courses: [{ id: ++calls }] }),
    calls: () => calls,
  };
}
test("pauses survive reload with exact-key snapshots; uncaptured requests never load", async () => {
  const f = fixture();
  await f.create().run("catalog", "q=CSE", f.load);
  f.flags.pauseCatalog = true;
  const reloaded = f.create();
  assert.deepEqual(await reloaded.run("catalog", "q=CSE", f.load), {
    courses: [{ id: 1 }],
  });
  await assert.rejects(reloaded.run("catalog", "q=MATH", f.load), /paused/);
  assert.equal(f.calls(), 1);
  f.flags.emptyCatalog = true;
  assert.deepEqual(
    await reloaded.run("catalog", "q=CSE", f.load, () => ({ courses: [] })),
    { courses: [] },
  );
  assert.equal(f.calls(), 1);
  f.flags.emptyCatalog = false;
  f.advance(4 * 3600000 + 1);
  await assert.rejects(reloaded.run("catalog", "q=CSE", f.load), /paused/);
});
test("snapshots are bounded, expire, and keep user data separate", async () => {
  const f = fixture(),
    store = f.create();
  f.data.set("favorites", "keep");
  for (let i = 0; i < 60; i++) await store.run("rmp", String(i), f.load);
  assert.equal(JSON.parse(f.data.get(DEBUG_RESPONSES_KEY)).length, 50);
  assert.ok(f.data.get(DEBUG_RESPONSES_KEY).length < 1500000);
  f.flags.pauseRmp = true;
  await assert.rejects(store.run("rmp", "0", f.load), /paused/);
  assert.ok(await store.run("rmp", "59", f.load));
  store.clear();
  assert.equal(f.data.get("favorites"), "keep");
  assert.equal(f.data.has(DEBUG_RESPONSES_KEY), false);
  await assert.rejects(store.run("rmp", "59", f.load), /paused/);
});
test("failed responses and unavailable storage do not corrupt real feature behavior", async () => {
  const f = fixture();
  await assert.rejects(
    f.create().run("translation", "text", async () => {
      throw Error("network");
    }),
    /network/,
  );
  assert.equal(f.data.size, 0);
  const store = createDebugServiceStore({
    flags: (k) => f.flags[k],
    capture: () => true,
    storage: {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
      removeItem() {
        throw Error();
      },
    },
  });
  assert.deepEqual(await store.run("seats", "section", f.load), {
    courses: [{ id: 1 }],
  });
  f.flags.pauseSeats = true;
  await assert.rejects(store.run("seats", "section", f.load), /paused/);
  f.flags.failTranslation = true;
  await assert.rejects(store.run("translation", "text", f.load), /simulated/);
  assert.equal(f.calls(), 1);
});
test("catalog, seats, RMP and other simulations short-circuit all service endpoints", async () => {
  const previous = globalThis.window;
  globalThis.window = {
    __COURSE_ATLAS_DEBUG__: {
      ...DEFAULT_DEBUG_FLAGS,
      emptyCatalog: true,
      emptySeats: true,
      emptyRmp: true,
      emptyEvaluations: true,
      emptyPeople: true,
    },
  };
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("must not fetch");
  };
  try {
    const transport = createCatalogTransport(fetcher);
    for (const q of ["CS1100", "CSED 1100", "arbitrary text"]) {
      const result = await (
        await transport.request(`/api/catalog?q=${encodeURIComponent(q)}`)
      ).json();
      assert.deepEqual(result.courses, []);
      assert.equal(result.debug, true);
    }
    assert.equal(
      (
        await (
          await transport.request("/api/catalog/availability?courseId=123")
        ).json()
      ).availability,
      null,
    );
    const rmp = await (
      await debugFetch(
        "rmp",
        "/api/rmp/summaries",
        { body: JSON.stringify({ courses: [{ id: "cse" }] }) },
        fetcher,
      )
    ).json();
    assert.equal(rmp.summaries.cse.status, "no-data");
    assert.deepEqual(
      (
        await (
          await debugFetch(
            "evaluations",
            "/api/evaluations",
            undefined,
            fetcher,
          )
        ).json()
      ).summaries,
      {},
    );
    assert.deepEqual(
      (
        await (
          await debugFetch("people", "/api/people/lookup", undefined, fetcher)
        ).json()
      ).results,
      [],
    );
    window.__COURSE_ATLAS_DEBUG__.emptyCatalog = false;
    window.__COURSE_ATLAS_DEBUG__.pauseCatalog = true;
    assert.equal(
      (await transport.request("/api/catalog?q=unknown")).status,
      503,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.window = previous;
  }
});
test("ordinary traffic retains its response and errors without debug cloning", async () => {
  const response = new Response("plain body", { status: 502 });
  assert.equal(
    await debugResponse("catalog", "key", async () => response),
    response,
  );
  await assert.rejects(
    debugResponse("catalog", "key", async () => {
      throw Error("original");
    }),
    /original/,
  );
});

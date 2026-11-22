import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  loadSearchGeneration,
  withGenerationDeadline,
  withinSearchDeadline,
  withSearchConnection,
} from "../../src/lib/search/generation-fallback.ts";

test("the request deadline bounds queued work and returns a late connection unused", async () => {
  await assert.rejects(
    withinSearchDeadline(new Promise(() => {}), performance.now() + 5),
    /budget/,
  );
  let resolveConnection,
    reads = 0;
  const releases = [];
  const connection = { release: (destroy) => releases.push(destroy) };
  const pending = new Promise((resolve) => {
    resolveConnection = resolve;
  });
  await assert.rejects(
    withSearchConnection(
      { connect: () => pending },
      performance.now() + 5,
      100,
      async () => {
        reads++;
      },
    ),
    /budget/,
  );
  resolveConnection(connection);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 0);
  assert.deepEqual(releases, [undefined]);
});

test(
  "a timed-out real PostgreSQL read frees its sole pool slot for fallback",
  { skip: process.env.CATALOG_DATABASE_TEST !== "1" },
  async () => {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    try {
      const connection = await pool.connect();
      await assert.rejects(
        withGenerationDeadline(connection, 50, () =>
          connection.query("SELECT pg_sleep(5)"),
        ),
        /terminated|closed|cancel/i,
      );
      assert.equal((await pool.query("SELECT 1 AS ready")).rows[0].ready, 1);
    } finally {
      await pool.end();
    }
  },
);

test("attempt timeouts cancel the pooled read and release exactly once", async () => {
  const releases = [];
  let cancel;
  const blocked = new Promise((resolve, reject) => {
    cancel = reject;
  });
  await assert.rejects(
    withGenerationDeadline(
      {
        release: (destroy) => {
          releases.push(destroy);
          if (destroy) cancel(Error("read cancelled"));
        },
      },
      5,
      () => blocked,
    ),
    /read cancelled/,
  );
  assert.deepEqual(releases, [true]);
  releases.length = 0;
  assert.equal(
    await withGenerationDeadline(
      { release: (destroy) => releases.push(destroy) },
      1000,
      async () => "ready",
    ),
    "ready",
  );
  assert.deepEqual(releases, [undefined]);
});

const latest = { run: "latest", term: "1272" },
  previous = { run: "previous", term: "1272" };
test("a damaged current generation falls back without changing term or a pinned cursor", async () => {
  const calls = [],
    events = [];
  const load = async (generation) => {
    calls.push(generation.run);
    if (generation.run === latest.run) throw Error("damaged corpus");
    return { ...generation, complete: true };
  };
  const options = {
    load,
    previous: async () => previous,
    onFallback: (event) => events.push(event),
  };
  assert.equal((await loadSearchGeneration(latest, options)).run, "previous");
  assert.deepEqual(calls, ["latest", "previous"]);
  assert.equal(events[0].fallbackRun, "previous");
  calls.length = 0;
  await assert.rejects(
    loadSearchGeneration(latest, { ...options, pinned: true }),
    /damaged/,
  );
  assert.deepEqual(calls, ["latest"]);
});
test("recovery bounds unavailable generations and rejects loops or cross-term fallbacks", async () => {
  let calls = 0;
  await assert.rejects(
    loadSearchGeneration(latest, {
      load: async () => {
        calls++;
        throw Error("unavailable");
      },
      previous: async (g) => ({ ...g, run: g.run + "-older" }),
      onFallback: () => {},
    }),
    /unavailable/,
  );
  assert.equal(calls, 3);
  for (const next of [latest, { ...previous, term: "1268" }, null]) {
    calls = 0;
    await assert.rejects(
      loadSearchGeneration(latest, {
        load: async () => {
          calls++;
          throw Error("unavailable");
        },
        previous: async () => next,
        onFallback: () => {},
      }),
      /unavailable/,
    );
    assert.equal(calls, 1);
  }
});

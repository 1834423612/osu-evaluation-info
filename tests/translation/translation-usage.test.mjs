import assert from "node:assert/strict";
import test from "node:test";
import {
  createTranslationUsage,
  createDatabaseTranslationUsage,
} from "../../src/lib/translation/usage.ts";

const event = {
  provider: "ollama",
  target: "zh-CN",
  outcome: "success",
  characters: 10,
  durationMs: 20,
};

test("usage stores only small daily aggregates with bounded flush frequency", async () => {
  const writes = [];
  let time = Date.UTC(2026, 10, 8);
  const usage = createTranslationUsage(
    async (buckets) => {
      writes.push(buckets);
    },
    () => time,
  );
  usage.observe(event);
  usage.observe({ ...event, durationMs: 40 });
  await usage.flush();
  assert.deepEqual(writes[0], [
    {
      ...event,
      day: "2026-11-08",
      count: 2,
      characters: 20,
      durationMs: 60,
      maxDurationMs: 40,
    },
  ]);
  usage.observe(event);
  await usage.flush();
  assert.equal(writes.length, 1);
  time += 30001;
  await usage.flush();
  assert.equal(writes.length, 2);
  assert.equal(writes[1][0].count, 1);
});

test("failed writes merge with new observations and retry without blocking translation", async () => {
  const writes = [];
  let attempt = 0;
  const usage = createTranslationUsage(async (buckets) => {
    attempt++;
    if (attempt === 1) {
      usage.observe(event);
      throw Error("database offline");
    }
    writes.push(buckets);
  });
  usage.observe(event);
  await usage.flush();
  await usage.flush(true);
  assert.equal(writes[0][0].count, 2);
  assert.equal(writes[0][0].characters, 20);
});

test("database outages cannot grow the statistics buffer beyond 512 dimensions", async () => {
  let time = Date.UTC(2025, 0, 1);
  const writes = [];
  const usage = createTranslationUsage(
    async (buckets) => {
      writes.push(buckets);
    },
    () => time,
  );
  for (let day = 0; day < 600; day++) {
    usage.observe(event);
    time += 86400000;
  }
  await usage.flush();
  assert.equal(writes[0].length, 512);
});

test("metrics can be disabled and do not require a database for translation", async () => {
  for (const env of [
    {},
    { DATABASE_URL: "unused", TRANSLATION_USAGE_ENABLED: "false" },
  ]) {
    const usage = createDatabaseTranslationUsage(env);
    usage.observe(event);
    await usage.flush();
  }
});

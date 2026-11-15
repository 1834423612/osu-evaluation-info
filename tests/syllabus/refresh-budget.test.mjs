import assert from "node:assert/strict";
import { test } from "node:test";
import {
  syllabusBudget,
  SyllabusBudgetReached,
} from "../../scripts/syllabus/budget.mjs";
import { pacedFetch, parseSyncOptions } from "../../scripts/syllabus/sync.mjs";
test("syllabus budgets stop pacing and Retry-After waits without sending another request", async () => {
  let now = 0,
    calls = 0;
  const sleep = async (ms) => {
      now += ms;
    },
    budget = syllabusBudget(5, () => now);
  const fetcher = pacedFetch(350, budget, {
    sleep,
    fetcher: async () => {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { "retry-after": "60" },
      });
    },
  });
  await assert.rejects(
    fetcher("https://example.invalid", {}),
    SyllabusBudgetReached,
  );
  assert.equal(calls, 1);
  assert.equal(now, 350);
  now = 5000;
  assert.throws(() => budget.signal(), SyllabusBudgetReached);
  assert.equal(
    parseSyncOptions(["--max-runtime-seconds", "1200"]).maxRuntimeSeconds,
    1200,
  );
  assert.throws(() => parseSyncOptions(["--max-runtime-seconds", "-1"]));
});

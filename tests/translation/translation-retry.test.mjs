import assert from "node:assert/strict";
import test from "node:test";
import { createTranslationRetry } from "../../src/lib/translation/retry.ts";

test("snippet failures back off exponentially, honor longer hints and reset after recovery or key changes", () => {
  let now = 1000;
  const retry = createTranslationRetry(() => now);
  for (const delay of [
    5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000,
  ]) {
    retry.fail();
    assert.equal(retry.remaining(), delay);
    now += delay;
  }
  retry.reset();
  assert.equal(retry.remaining(), 0);
  retry.fail(120000);
  now += 1000;
  assert.equal(retry.remaining(), 119000);
  retry.reset();
  retry.fail(NaN);
  assert.equal(retry.remaining(), 5000);
});

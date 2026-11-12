import test from "node:test";
import assert from "node:assert/strict";
import { createIndexCache } from "../../src/lib/search/index-cache.ts";
test("index builds coalesce, serialize, retry failures and retain bounded published generations", async () => {
  const cache = createIndexCache(2);
  let calls = 0,
    active = 0,
    maximum = 0;
  const load = async () => {
    calls++;
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return calls;
  };
  const [a, b] = await Promise.all([
    cache.get("a", load),
    cache.get("a", load),
    cache.get("b", load),
  ]);
  assert.equal(a, b);
  assert.equal(calls, 2);
  assert.equal(maximum, 1);
  await assert.rejects(
    cache.get("bad", async () => {
      throw new Error("failed");
    }),
  );
  assert.equal(
    await cache.get("a", () => {
      throw new Error("replaced old index");
    }),
    a,
  );
  await cache.get("bad", load);
  assert.equal(cache.size(), 2);
  assert.equal(calls, 3);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  historyHref,
  parseHistory,
  mergeHistory,
} from "../../src/lib/history/model.ts";
const now = Date.parse("2026-11-14T12:00:00Z");
const item = {
  id: "search:math",
  kind: "search",
  title: "MATH 1151",
  context: "2026 col",
  href: "/?q=MATH+1151&term=1268",
  at: new Date(now).toISOString(),
};
test("history removes credentials, fragments, foreign origins and unsupported routes", () => {
  assert.equal(historyHref("https://evil.example/?q=math"), null);
  assert.equal(historyHref("/account?token=secret"), null);
  assert.equal(historyHref("/?q=test@example.com"), null);
  assert.equal(historyHref("/?q=math&token=secret#recovery=123"), "/?q=math");
});
test("repeated searches move to top, expire after 90 days and have bounded distinct capacity", () => {
  const old = {
    ...item,
    id: "old",
    at: new Date(now - 91 * 86400000).toISOString(),
  };
  assert.deepEqual(parseHistory(JSON.stringify([old, item, item]), now), [
    item,
  ]);
  assert.equal(
    mergeHistory([item], { ...item, title: "new" }, now)[0].title,
    "new",
  );
  assert.equal(
    parseHistory(
      JSON.stringify(
        Array.from({ length: 130 }, (_, i) => ({ ...item, id: String(i) })),
      ),
      now,
    ).length,
    100,
  );
});

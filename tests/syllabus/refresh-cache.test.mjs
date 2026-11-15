import assert from "node:assert/strict";
import { test } from "node:test";
import { refreshCutoffs } from "../../scripts/syllabus/refresh.mjs";
test("refresh cutoffs distinguish active archives and missing documents and force a final post-term check", () => {
  const now = Date.parse("2026-11-15T12:00:00Z"),
    options = {
      refreshHours: 168,
      archiveRefreshHours: 720,
      missingRefreshHours: 72,
    };
  assert.deepEqual(refreshCutoffs({ endsAt: null }, options, now), {
    positive: "2026-11-08T12:00:00.000Z",
    negative: "2026-11-12T12:00:00.000Z",
  });
  const ended = refreshCutoffs(
    { endsAt: "2026-11-14T12:00:00Z" },
    options,
    now,
  );
  assert.equal(ended.positive, "2026-11-14T12:00:00.000Z");
  assert.equal(ended.negative, ended.positive);
  assert.equal(
    refreshCutoffs({ endsAt: "2026-11-16" }, options, now).positive,
    "2026-11-14T12:00:00.000Z",
  );
  assert.deepEqual(
    refreshCutoffs(
      { endsAt: "invalid" },
      { ...options, refreshHours: 0, missingRefreshHours: 0 },
      now,
    ),
    { positive: null, negative: null },
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { formatReleaseTime } from "../../src/lib/layout/release-time.ts";

test("release dates follow browser zones across date boundaries and daylight-saving offsets", () => {
  const value = "2026-11-10T01:33:00Z";
  assert.match(
    formatReleaseTime(value, "en", "America/New_York").label,
    /Nov 9.*20:33/,
  );
  assert.match(
    formatReleaseTime(value, "en", "Asia/Tokyo").label,
    /Nov 10.*10:33/,
  );
  assert.match(
    formatReleaseTime(value, "zh", "Asia/Shanghai").label,
    /11月10日.*09:33/,
  );
  assert.match(
    formatReleaseTime("2026-07-10T01:33:00Z", "en", "America/New_York").label,
    /Jul 9.*21:33/,
  );
  assert.equal(formatReleaseTime("invalid", "en", "UTC"), null);
  assert.equal(formatReleaseTime(value, "en", "invalid").zone, "UTC");
});

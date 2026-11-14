import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRmpRating,
  formatRmpPercent,
  profileInitials,
} from "../../src/lib/rmp/display.ts";
test("source missing-value sentinels are not shown as negative percentages or zero ratings", () => {
  assert.equal(formatRmpPercent(-1), "—");
  assert.equal(formatRmpPercent(null), "—");
  assert.equal(formatRmpPercent(0), "0%");
  assert.equal(formatRmpPercent(100), "100%");
  assert.equal(formatRmpRating(0), "—");
  assert.equal(formatRmpRating(4.5), "4.5");
  assert.equal(profileInitials(". Sun"), "S");
});

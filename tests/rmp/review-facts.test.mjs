import assert from "node:assert/strict";
import test from "node:test";
import {
  rmpReviewFact,
  rmpTextbookFact,
} from "../../src/lib/rmp/review-facts.ts";
test("review facts distinguish missing sentinels, recorded zero and unknown source values", () => {
  assert.equal(rmpReviewFact("-1", "zh"), "未填写");
  assert.equal(rmpReviewFact("non mandatory", "zh"), "不要求");
  assert.equal(rmpReviewFact("Y", "zh"), "是");
  assert.equal(rmpReviewFact("N", "en"), "No");
  assert.equal(rmpReviewFact("Not_Sure_Yet", "zh"), "尚未确定");
  assert.equal(rmpReviewFact("A+", "zh"), "A+");
  assert.equal(
    rmpReviewFact("future source value", "en"),
    "future source value",
  );
  assert.equal(rmpTextbookFact("0", "zh"), "0 (RMP)");
  assert.equal(rmpTextbookFact("5", "en"), "5 (RMP)");
  assert.equal(rmpTextbookFact(null, "zh"), null);
});

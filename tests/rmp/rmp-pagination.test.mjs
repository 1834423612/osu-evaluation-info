import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_REVIEW_OFFSET,
  REVIEW_PAGE_SIZE,
  normalizeReviewOffset,
  parseReviewOffset,
  reviewPagination,
} from "../../src/lib/rmp/pagination.ts";

describe("RMP review pagination", () => {
  it("keeps reviews beyond the previous 5,000-offset limit reachable", () => {
    const { pageCount, reachableCount } = reviewPagination(6_001);
    assert.equal(reachableCount, 6_001);
    assert.equal(
      parseReviewOffset(String((pageCount - 1) * REVIEW_PAGE_SIZE)),
      6_000,
    );
    assert.equal(parseReviewOffset("100000"), MAX_REVIEW_OFFSET);
  });

  it("advertises only pages with offsets accepted by the API", () => {
    for (const total of [0, 1, 3, 6, 7, 5_007, 100_000, 100_003, 500_000]) {
      const { pageCount, reachableCount } = reviewPagination(total);
      assert.ok(reachableCount <= total);
      if (pageCount > 0)
        assert.doesNotThrow(() =>
          normalizeReviewOffset((pageCount - 1) * REVIEW_PAGE_SIZE),
        );
      if (reachableCount < total)
        assert.throws(
          () => normalizeReviewOffset(pageCount * REVIEW_PAGE_SIZE),
          RangeError,
        );
    }
  });

  it("rejects excessive, fractional, negative and malformed offsets", () => {
    for (const value of [
      "100001",
      "1000000",
      "-1",
      "1.5",
      "1e3",
      " 6",
      "NaN",
      "",
    ])
      assert.throws(() => parseReviewOffset(value), RangeError);
    for (const value of [-1, 0.5, 100_001, Infinity, NaN])
      assert.throws(() => normalizeReviewOffset(value), RangeError);
  });
});

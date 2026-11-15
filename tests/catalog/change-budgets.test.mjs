import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureCourseChanges,
  parseChangeBackfillOptions,
} from "../../scripts/catalog/changes.mjs";
test("change-history runtime and batch budgets are bounded and expired work cannot write a completion marker", async () => {
  assert.deepEqual(
    parseChangeBackfillOptions(["--max-seconds", "120", "--max-batches", "3"]),
    { maxSeconds: 120, maxBatches: 3 },
  );
  for (const args of [
    ["--max-seconds", "0"],
    ["--max-batches", "201"],
    ["--max-seconds", "2.5"],
    ["--max-seconds"],
    ["--max-seconds", "5", "--max-seconds", "6"],
  ])
    assert.throws(() => parseChangeBackfillOptions(args));
  let queries = 0;
  await assert.rejects(
    captureCourseChanges(
      {
        query: () => {
          queries++;
        },
      },
      "run",
      "1268",
      { deadline: 0 },
    ),
    (error) => error.code === "CATALOG_CHANGE_BUDGET",
  );
  assert.equal(queries, 0);
});

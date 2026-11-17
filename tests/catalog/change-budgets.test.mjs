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

test("timed-out chunks roll back before a smaller retry without duplicating courses", async () => {
  const chunks = [],
    operations = [];
  let attempts = 0;
  const client = {
    query: async (sql, args) => {
      operations.push(sql);
      if (sql.includes("SELECT 1 FROM osu_catalog.change_batches"))
        return { rowCount: 0 };
      if (sql.includes("published_at::text"))
        return { rows: [{ published_at: "2026-01-02" }] };
      if (sql.includes("SELECT v.run_id"))
        return { rows: [{ run_id: "previous" }] };
      if (sql.includes("SELECT DISTINCT course_id"))
        return {
          rows: [{ course_id: "a" }, { course_id: "b" }, { course_id: "c" }],
        };
      if (sql.includes("/* course-change-chunk */")) {
        if (attempts++ === 0)
          throw Object.assign(Error("statement timeout"), { code: "57014" });
        chunks.push(...args[3]);
        return { rowCount: args[3].length };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  assert.equal(
    await captureCourseChanges(client, "target", "1272", { chunkSize: 3 }),
    3,
  );
  assert.deepEqual(chunks, ["a", "b", "c"]);
  assert.equal(
    operations.filter(
      (sql) => sql === "ROLLBACK TO SAVEPOINT course_change_chunk",
    ).length,
    1,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
import { importPlanningFiles } from "../../src/lib/planning/batch-import.ts";
const fixture = () =>
  parsePlanLines(
    [
      { text: "Autumn 2028", page: 1 },
      { text: "CSE 2999 3h Planned", page: 1 },
    ],
    "student-plan",
  ).plan;
const file = (name) => ({
  name,
  size: 100,
  text: async () =>
    JSON.stringify({ ...fixture(), name: "PRIVATE", reviewed: true }),
});
test("mixed multi-file imports preserve separate sources and strip backup extras", async () => {
  const result = await importPlanningFiles(
    [file("personal.pdf"), file("personal.json"), file("broken.pdf")],
    {
      existing: emptyPlan(),
      replace: false,
      signal: new AbortController().signal,
      extract: async (f) => {
        if (f.name === "broken.pdf") throw Error();
        return fixture();
      },
    },
  );
  assert.equal(result.imported, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.plan.documents.length, 2);
  assert.equal(result.plan.reviewed, false);
  assert.doesNotMatch(JSON.stringify(result), /personal|PRIVATE|filename/);
});
test("cancellation and all-failed replacement retain the previous draft", async () => {
  const previous = fixture();
  const controller = new AbortController();
  await assert.rejects(
    importPlanningFiles([file("one.pdf"), file("two.pdf")], {
      existing: previous,
      replace: true,
      signal: controller.signal,
      extract: async () => {
        controller.abort();
        return fixture();
      },
    }),
    /cancelled/,
  );
  assert.equal(previous.documents.length, 1);
  const failed = await importPlanningFiles([file("broken.pdf")], {
    existing: previous,
    replace: true,
    signal: new AbortController().signal,
    extract: async () => {
      throw Error();
    },
  });
  assert.equal(failed.plan, previous);
});
test("batch limits are enforced before any extraction", async () => {
  let called = false;
  await assert.rejects(
    importPlanningFiles(
      Array.from({ length: 13 }, () => file("file.pdf")),
      {
        existing: emptyPlan(),
        replace: false,
        signal: new AbortController().signal,
        extract: async () => {
          called = true;
          return fixture();
        },
      },
    ),
    /batch-size/,
  );
  assert.equal(called, false);
});

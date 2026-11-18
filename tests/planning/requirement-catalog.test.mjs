import { test } from "node:test";
import assert from "node:assert/strict";
import { readRequirementCourses } from "../../src/lib/planning/requirement-catalog.ts";
import { requirementCodes } from "../../src/lib/planning/programs.ts";
test("category lookup preserves campus and cursor and rejects relaxed unrelated results", async () => {
  let params;
  const result = await readRequirementCourses(
    "Historical and Cultural Studies",
    { campus: "MNS", term: "1272" },
    async (url) => {
      params = new URL(url, "http://local").searchParams;
      return Response.json({
        courses: [
          {
            id: "yes",
            attributes: ["GEN Foundation: Historical and Cultural Studies"],
          },
          { id: "no", attributes: ["GEN Foundation: Natural Sciences"] },
        ],
        nextCursor: "next",
      });
    },
    new AbortController().signal,
    "page2",
  );
  assert.equal(params.get("campus"), "mns");
  assert.equal(params.get("cursor"), "page2");
  assert.equal(params.get("term"), "1272");
  assert.deepEqual(
    result.courses.map((c) => c.id),
    ["yes"],
  );
  assert.equal(result.nextCursor, "next");
});
test("unmapped requirements do not query an unrestricted catalog", async () => {
  const result = await readRequirementCourses(
    "Major GPA",
    { campus: "COL", term: "" },
    () => {
      throw Error("must not request");
    },
    new AbortController().signal,
  );
  assert.equal(result.mapped, false);
});
test("unmapped requirements can browse a chosen subject without claiming degree applicability", async () => {
  let params;
  const result = await readRequirementCourses(
    "Specialization electives",
    { campus: "MNS", term: "1272" },
    async (url) => {
      params = new URL(url, "https://local").searchParams;
      return Response.json({
        courses: [
          { id: "cse", subject: "CSE", catalogNumber: "1223" },
          { id: "bio", subject: "BIOLOGY", catalogNumber: "1113" },
        ],
      });
    },
    new AbortController().signal,
    undefined,
    { subject: "CSE" },
  );
  assert.equal(params.get("subject"), "CSE");
  assert.equal(params.get("campus"), "mns");
  assert.equal(result.mapped, false);
  assert.deepEqual(
    result.courses.map((c) => c.id),
    ["cse"],
  );
});
test("explicit requirement titles retain base and alternative course numbers", () => {
  assert.deepEqual(
    requirementCodes({ alternatives: [], title: "MATH 1131 or 1151 Calculus" }),
    [
      { subject: "MATH", number: "1131" },
      { subject: "MATH", number: "1151" },
    ],
  );
  assert.deepEqual(
    requirementCodes({ alternatives: [], title: "Minimum GPA 2.0" }),
    [],
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRmpInsights,
  parseRmpPreviewBatch,
} from "../../src/lib/rmp/insights.ts";
import { createRmpPreviewClient } from "../../src/lib/rmp/preview-client.ts";

const professor = (id, difficulty, count, tags) => ({
  professorId: id,
  recentDifficulty: difficulty,
  recentDifficultyCount: count,
  reviewCount: count,
  topTags: tags,
});
test("difficulty weights every professor by valid recent ratings, and duplicate profiles cannot inflate tags", () => {
  const first = professor("1", 2, 10, [{ tag: "Caring", count: 3 }]);
  const result = aggregateRmpInsights({
    status: "available",
    instructors: [
      first,
      professor("2", 4, 30, [
        { tag: "caring", count: 2 },
        { tag: "Lots of homework", count: 9 },
      ]),
      first,
      professor("3", null, 50, []),
    ],
    requestedInstructorCount: 3,
    matchedInstructorCount: 3,
    recentSince: "2024-01-01",
  });
  assert.equal(result.difficulty, 3.5);
  assert.equal(result.difficultyCount, 40);
  assert.equal(result.tags.find((item) => item.tag === "Caring").count, 5);
  assert.equal(result.tags[0].tag, "Lots of homework");
});
test("empty ratings stay unknown and public batch inputs are bounded and normalized", () => {
  assert.equal(
    aggregateRmpInsights({
      status: "no-data",
      instructors: [],
      matchedInstructorCount: 0,
      requestedInstructorCount: 0,
      recentSince: "2024-01-01",
    }).difficulty,
    null,
  );
  assert.equal(
    parseRmpPreviewBatch({
      courses: [
        {
          id: "a",
          subject: "cse",
          catalogNumber: "2221",
          campus: "col",
          usernames: ["teacher.1"],
        },
      ],
    })[0].subject,
    "CSE",
  );
  assert.throws(() =>
    parseRmpPreviewBatch({ courses: Array.from({ length: 25 }, () => ({})) }),
  );
  assert.throws(() =>
    parseRmpPreviewBatch({
      courses: [
        {
          id: "a",
          subject: "CSE",
          catalogNumber: "2221",
          campus: "col",
          usernames: ["not-an-identity"],
        },
      ],
    }),
  );
});
test("list previews batch and share requests without fetching one endpoint per card", async () => {
  const calls = [];
  const client = createRmpPreviewClient(async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.courses);
    return Response.json({
      summaries: Object.fromEntries(
        body.courses.map((course) => [
          course.id,
          { status: "no-data", tags: [] },
        ]),
      ),
    });
  });
  const input = {
    subject: "CSE",
    catalogNumber: "2221",
    campus: "COL",
    usernames: ["teacher.1"],
  };
  const first = client.request(input);
  assert.equal(first, client.request(input));
  await Promise.all([
    first,
    client.request({ ...input, catalogNumber: "2231" }),
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  await client.request(input);
  assert.equal(calls.length, 1);
});

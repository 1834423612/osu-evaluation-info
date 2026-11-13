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
test("RMP quality uses valid recent quality counts and does not substitute difficulty", () => {
  const first = {
    ...professor("1", 1, 100, []),
    recentQuality: 4,
    recentQualityCount: 10,
  };
  const result = aggregateRmpInsights({
    instructors: [
      first,
      first,
      { ...professor("2", 5, 1, []), recentQuality: 2, recentQualityCount: 30 },
      {
        ...professor("3", 5, 10, []),
        recentQuality: null,
        recentQualityCount: 10,
      },
    ],
  });
  assert.equal(result.quality, 2.5);
  assert.equal(result.qualityCount, 40);
  assert.equal(
    aggregateRmpInsights({ instructors: [professor("1", 4, 10, [])] }).quality,
    null,
  );
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
test("historical difficulty is sample-weighted only when the course has no recent ratings", () => {
  const first = {
    ...professor("1", null, 0, []),
    reviewCount: 5,
    historicalDifficulty: 2,
    historicalDifficultyCount: 5,
  };
  const second = {
    ...professor("2", null, 0, []),
    reviewCount: 15,
    historicalDifficulty: 4,
    historicalDifficultyCount: 15,
  };
  const summary = { status: "available", instructors: [first, second, first] };
  const historical = aggregateRmpInsights(summary);
  assert.equal(historical.difficulty, 3.5);
  assert.equal(historical.difficultyCount, 20);
  assert.equal(historical.difficultyPeriod, "historical");
  const recent = aggregateRmpInsights({
    ...summary,
    instructors: [
      { ...first, recentDifficulty: 1, recentDifficultyCount: 2 },
      second,
    ],
  });
  assert.equal(recent.difficulty, 1);
  assert.equal(recent.difficultyCount, 2);
  assert.equal(recent.difficultyPeriod, "recent");
  const unknown = aggregateRmpInsights({
    ...summary,
    instructors: [
      { ...first, historicalDifficulty: null },
      { ...second, historicalDifficulty: 6 },
    ],
  });
  assert.equal(unknown.difficulty, null);
  assert.equal(unknown.difficultyPeriod, "none");
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

test("confirmed course reviews take priority; unconfirmed-only courses retain scores with provenance", () => {
  const verified = {
    ...professor("v", 2, 2, []),
    association: "verified",
    recentQuality: 4,
    recentQualityCount: 2,
  };
  const lead = {
    ...professor("u", 5, 20, [{ tag: "Caring", count: 3 }]),
    association: "unconfirmed",
    recentQuality: 1,
    recentQualityCount: 20,
  };
  const mixed = aggregateRmpInsights({ instructors: [verified, lead] });
  assert.equal(mixed.quality, 4);
  assert.equal(mixed.difficulty, 2);
  assert.equal(mixed.identityBasis, "verified");
  assert.equal(mixed.profileCount, 1);
  assert.equal(mixed.reviewCount, 2);
  const fallback = aggregateRmpInsights({
    instructors: [{ ...verified, reviewCount: 0 }, lead],
  });
  assert.equal(fallback.quality, 1);
  assert.equal(fallback.difficulty, 5);
  assert.equal(fallback.reviewCount, 20);
  assert.equal(fallback.identityBasis, "unconfirmed");
  assert.equal(fallback.tags[0].tag, "Caring");
});

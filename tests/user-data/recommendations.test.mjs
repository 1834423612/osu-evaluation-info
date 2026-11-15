import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sampleRecommendations,
  recommendationWeight,
} from "../../src/lib/catalog/recommendation-score.ts";
import { browserContextSchema } from "../../src/lib/telemetry/context.ts";
import { toggleSelection } from "../../src/lib/saved/selection.ts";
const base = {
  id: "one",
  subject: "CSE",
  catalogNumber: "1000",
  description: "Course description",
  sections: [{}],
  attributes: [],
  evaluation: { primary: { score: 4.6, responseCount: 80 } },
};
test("recommendations favor evidence without making unrated courses invisible", () => {
  const high = { ...base, id: "high" },
    low = {
      ...base,
      id: "low",
      evaluation: { primary: { score: 2, responseCount: 80 } },
    },
    unknown = { ...base, id: "new", evaluation: undefined };
  assert.ok(recommendationWeight(high) > recommendationWeight(low));
  assert.ok(recommendationWeight(unknown) > 0);
  let wins = 0;
  for (let i = 0; i < 400; i++)
    if (sampleRecommendations([high, low], String(i), 1)[0].id === "high")
      wins++;
  assert.ok(wins > 220);
  assert.equal(sampleRecommendations([unknown], "seed", 1)[0].id, "new");
});
test("selection toggles a filtered group and preserves choices in other groups", () => {
  const initial = new Set(["other", "a"]);
  assert.deepEqual([...toggleSelection(initial, ["a", "b"])].sort(), [
    "a",
    "b",
    "other",
  ]);
  assert.deepEqual(
    [...toggleSelection(new Set(["other", "a", "b"]), ["a", "b"])],
    ["other"],
  );
  assert.deepEqual([...initial], ["other", "a"]);
});
test("automatic visitor context rejects permission-only data", () => {
  assert.equal(
    browserContextSchema.safeParse({
      gps: { latitude: 1, longitude: 1 },
      motion: { x: 1 },
    }).success,
    false,
  );
});

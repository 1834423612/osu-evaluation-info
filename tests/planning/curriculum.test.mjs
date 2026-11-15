import { test } from "node:test";
import assert from "node:assert/strict";
import { planningSchema } from "../../src/lib/planning/namespace.ts";
import { curriculumSchema } from "../../src/lib/planning/curriculum.ts";
test("planning namespace is isolated and rejects SQL injection", () => {
  assert.equal(planningSchema({}), "osu_planning_dev");
  assert.equal(planningSchema({ NODE_ENV: "production" }), "osu_planning");
  assert.throws(() => planningSchema({ PLANNING_SCHEMA: "osu_identity" }));
  assert.throws(() => planningSchema({ PLANNING_SCHEMA: "osu_planning;DROP" }));
});
test("official imports cannot contain private plan payloads", () => {
  assert.equal(
    curriculumSchema.safeParse({ name: "Student", rawText: "private" }).success,
    false,
  );
});

test("checked-in official candidates validate and remain explicitly pending", async () => {
  const { readFile } = await import("node:fs/promises");
  const rows = JSON.parse(
    await readFile(
      new URL("../../data/planning/curricula.json", import.meta.url),
      "utf8",
    ),
  );
  for (const row of rows) {
    const parsed = curriculumSchema.parse(row);
    assert.equal(parsed.reviewStatus, "pending");
    assert.equal(parsed.semesters.length, 8);
    assert.equal(parsed.applicableUntil, null);
  }
});

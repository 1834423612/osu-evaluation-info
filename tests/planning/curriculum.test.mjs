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

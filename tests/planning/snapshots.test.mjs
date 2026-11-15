import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
import { planSchema, emptyPlan } from "../../src/lib/planning/model.ts";
import {
  mergeSnapshots,
  removeSnapshot,
  requirementProgress,
  removeRequirement,
} from "../../src/lib/planning/snapshots.ts";
const lines = (...text) => text.map((text) => ({ text, page: 1 }));
function audit(code = "CIS", version = "AU2022") {
  return parsePlanLines(
    lines(
      `Program: ${code} (undeclared)`,
      `Applied Version: ${version}`,
      "Remaining Credits: 24",
      "Requirement 1: All of",
      "Requirement 1.1: Minimum 3 credits",
      "CSE 2999H",
      "Requirement 1.2: Choose 1 course",
      "CSE 2999H",
    ),
    "expanded-audit",
  ).plan;
}
test("multiple snapshots preserve program versions, requirements and allocation provenance", () => {
  const left = audit(),
    right = audit("IS", "AU2024");
  const merged = mergeSnapshots(left, right);
  assert.equal(merged.documents.length, 2);
  assert.equal(merged.programs.length, 2);
  assert.deepEqual(
    merged.programs.map((p) => p.appliedVersion),
    ["AU2022", "AU2024"],
  );
  assert.equal(merged.appliedVersion, null);
  assert.equal(merged.reviewed, false);
  assert.equal(merged.requirements.length, 6);
  assert.equal(merged.allocations.length, 4);
  assert.equal(merged.programs[0].remainingCredits, 24);
  assert.equal(merged.programs[1].remainingCredits, 24);
  assert.equal(
    merged.allocations.every((a) => !a.confirmed),
    true,
  );
  assert.equal(planSchema.safeParse(merged).success, true);
  const removed = removeSnapshot(merged, left.documents[0].id);
  assert.equal(removed.documents.length, 1);
  assert.equal(removed.programs[0].code, "IS");
  assert.equal(
    planSchema.safeParse(mergeSnapshots(removed, audit())).success,
    true,
  );
});
test("degree requirements do not become satisfied through duplicated or unknown credit observations", () => {
  const plan = audit();
  const requirement = plan.requirements.find((r) => r.kind === "credits");
  assert.equal(requirementProgress(plan, requirement.id).state, "insufficient");
  plan.allocations = plan.allocations.map((a) => ({ ...a, confirmed: true }));
  assert.equal(requirementProgress(plan, requirement.id).state, "unresolved");
  plan.semesters[0].courses[0].credits = 3;
  assert.equal(requirementProgress(plan, requirement.id).knownCredits, 3);
  assert.equal(
    requirementProgress(plan, plan.requirements[0].id).state,
    "satisfied",
  );
  const duplicated = mergeSnapshots(plan, plan);
  const duplicateCourse = duplicated.semesters[1].courses[0];
  duplicated.allocations.push({
    courseId: duplicateCourse.id,
    requirementId: requirement.id,
    confirmed: true,
  });
  assert.equal(requirementProgress(duplicated, requirement.id).knownCredits, 3);
  assert.equal(
    removeRequirement(duplicated, plan.requirements[0].id).requirements.length,
    3,
  );
});
test("schema upgrades old exports and rejects reference cycles and cross-program trees", () => {
  const old = { ...emptyPlan(), schemaVersion: 1 };
  delete old.documents;
  delete old.programs;
  delete old.requirements;
  delete old.allocations;
  assert.equal(planSchema.parse(old).schemaVersion, 2);
  const plan = audit();
  plan.requirements[0].parentId = plan.requirements[1].id;
  assert.equal(planSchema.safeParse(plan).success, false);
  assert.equal(
    requirementProgress(plan, plan.requirements[0].id).state,
    "unresolved",
  );
});

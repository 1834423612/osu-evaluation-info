import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import { addPlanningCourse } from "../../src/lib/planning/workspace.ts";
import { reconcilePlans } from "../../src/lib/planning/reconcile.ts";
let count = 0;
const id = () => `id-${++count}`;
function fixture() {
  return addPlanningCourse(
    emptyPlan(),
    { subject: "CSE", number: "2221" },
    "Spring2027",
    id,
  );
}
test("planning reconciliation merges independent device edits and settles idempotently", () => {
  const base = fixture(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.schedule.campuses = { Spring2027: "MNS" };
  remote.schedule.terms = ["Spring2027", "Summer2027"];
  const result = reconcilePlans(base, local, remote);
  assert.equal(result.schedule.campuses.Spring2027, "MNS");
  assert.ok(result.schedule.terms.includes("Summer2027"));
  assert.deepEqual(reconcilePlans(remote, result, result), result);
  assert.deepEqual(reconcilePlans(result, result, result), result);
});
test("planning reconciliation preserves deletions and cleans references", () => {
  const base = fixture(),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.documents = [];
  local.semesters = [];
  remote.schedule.campuses = { Spring2027: "COL" };
  const result = reconcilePlans(base, local, remote);
  assert.equal(result.documents.length, 0);
  assert.equal(result.semesters.length, 0);
  assert.equal(result.schedule.placements.length, 0);
  assert.ok(planSchema.safeParse(result).success);
  assert.equal(reconcilePlans(base, null, remote), null);
});
test("a response acknowledgement preserves edits made while the request was running", () => {
  const sent = fixture(),
    edited = structuredClone(sent);
  edited.schedule.campuses = { Spring2027: "MNS" };
  const result = reconcilePlans(sent, edited, sent);
  assert.equal(result.schedule.campuses.Spring2027, "MNS");
});
test("first synchronization remaps colliding independently imported identities", () => {
  const local = fixture(),
    remote = structuredClone(local);
  remote.semesters[0].courses[0].subject = "MATH";
  remote.semesters[0].courses[0].number = "1151";
  const result = reconcilePlans(null, local, remote);
  assert.equal(result.documents.length, 2);
  const rows = result.semesters.flatMap((s) => s.courses);
  assert.equal(new Set(rows.map((c) => c.id)).size, 2);
  assert.deepEqual(rows.map((c) => c.subject).sort(), ["CSE", "MATH"]);
});

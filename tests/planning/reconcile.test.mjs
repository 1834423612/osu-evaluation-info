import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import { addPlanningCourse } from "../../src/lib/planning/workspace.ts";
import { reconcilePlans } from "../../src/lib/planning/reconcile.ts";
import { applyRecommendationBundle } from "../../src/lib/planning/recommendation.ts";
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

test("same-term recommendation containers retain courses through concurrent edits and deletion", () => {
  const first = applyRecommendationBundle(
    emptyPlan(),
    [{ subject: "CSE", number: "2221", credits: 3 }],
    "Spring2027",
    id,
  );
  const base = applyRecommendationBundle(
    first,
    [{ subject: "MATH", number: "1151", credits: 5 }],
    "Spring2027",
    id,
  );
  assert.equal(base.semesters.length, 2);
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.semesters[0].courses[0].title = "Local course title";
  remote.semesters[1].courses[0].title = "Remote course title";
  const merged = reconcilePlans(base, local, remote);
  const courses = merged.semesters.flatMap((s) => s.courses);
  assert.deepEqual(
    courses.map((c) => c.title),
    ["Local course title", "Remote course title"],
  );
  const deleted = structuredClone(base);
  deleted.semesters[0].courses = [];
  assert.deepEqual(
    reconcilePlans(base, deleted, remote)
      .semesters.flatMap((s) => s.courses)
      .map((c) => c.number),
    ["1151"],
  );
  assert.deepEqual(reconcilePlans(merged, merged, merged), merged);
});

test("large same-term container merges keep every course within per-container limits", () => {
  const base = fixture();
  const template = base.semesters[0].courses[0];
  base.semesters = [0, 1].map((group) => ({
    ...base.semesters[0],
    courses: Array.from({ length: 80 }, (_, offset) => ({
      ...template,
      id: `large-${group}-${offset}`,
      number: String(2000 + group * 80 + offset),
    })),
  }));
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.semesters[0].courses[0].title = "Local";
  remote.semesters[1].courses[0].title = "Remote";
  const merged = reconcilePlans(base, local, remote);
  assert.equal(merged.semesters.flatMap((s) => s.courses).length, 160);
  assert.ok(merged.semesters.every((s) => s.courses.length <= 100));
});
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

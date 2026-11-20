import test from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import { calendarSchema } from "../../src/lib/calendar/model.ts";
import { reconcilePlans } from "../../src/lib/planning/reconcile.ts";
import { addPlanningCourse } from "../../src/lib/planning/workspace.ts";
import {
  projectSyncPlan,
  planConflicts,
} from "../../src/lib/planning/sync-selection.ts";
const calendar = (title) =>
  calendarSchema.parse({
    id: "calendar",
    title,
    kind: "personal",
    events: [],
    updatedAt: "2026-11-19T00:00:00Z",
  });
const fixture = (title, campus) => {
  const plan = emptyPlan();
  plan.schedule.calendars = [calendar(title)];
  plan.schedule.campuses = { Spring2027: campus };
  return plan;
};
test("paused calendars preserve the cloud payload and the unsynced local calendar independently", () => {
  const local = fixture("Local edit", "MNS"),
    cloud = fixture("Cloud edit", "COL");
  const features = { favorites: true, planning: true, calendars: false };
  const upload = projectSyncPlan(local, cloud, features);
  assert.equal(upload.schedule.campuses.Spring2027, "MNS");
  assert.equal(upload.schedule.calendars[0].title, "Cloud edit");
  assert.equal(
    projectSyncPlan(cloud, local, features).schedule.calendars[0].title,
    "Local edit",
  );
  assert.equal(local.schedule.calendars[0].title, "Local edit");
  planSchema.parse(upload);
});
test("calendar-only sync preserves cloud planning and never turns an empty local plan into cloud deletion", () => {
  const cloud = fixture("Cloud", "COL"),
    local = fixture("Local", "MNS");
  const value = projectSyncPlan(local, cloud, {
    favorites: true,
    planning: false,
    calendars: true,
  });
  assert.equal(value.schedule.campuses.Spring2027, "COL");
  assert.equal(value.schedule.calendars[0].title, "Local");
  const removal = projectSyncPlan(null, cloud, {
    favorites: true,
    planning: false,
    calendars: true,
  });
  assert.equal(removal.schedule.campuses.Spring2027, "COL");
  assert.equal(removal.schedule.calendars, undefined);
  planSchema.parse(removal);
});
test("concurrent field edits require a decision while independent edits and identical values merge", () => {
  const base = fixture("Original", "COL"),
    local = fixture("Local", "COL"),
    cloud = fixture("Cloud", "COL");
  assert.deepEqual(planConflicts(base, local, cloud), [
    "plan.schedule.calendars[].title",
  ]);
  assert.deepEqual(planConflicts(base, local, local), []);
  cloud.schedule.calendars[0].title = "Original";
  cloud.schedule.campuses.Spring2027 = "MNS";
  assert.deepEqual(planConflicts(base, local, cloud), []);
});

test("resuming a paused domain adopts remote edits and flags competing local edits against its original baseline", () => {
  for (const paused of ["planning", "calendars"]) {
    const features = {
      favorites: true,
      planning: true,
      calendars: true,
      [paused]: false,
    };
    const original = fixture("Original", "COL");
    const remote = fixture("Remote calendar", "MNS");
    // A sync cycle advances the enabled domain only, while retaining the full server payload separately.
    const baseline = projectSyncPlan(remote, original, features);
    const local = projectSyncPlan(remote, original, features);
    const outgoing = projectSyncPlan(local, remote, features);
    assert.deepEqual(outgoing, remote);
    assert.deepEqual(planConflicts(baseline, local, remote), []);
    const resumed = reconcilePlans(baseline, local, remote);
    assert.equal(resumed.schedule.campuses.Spring2027, "MNS");
    assert.equal(resumed.schedule.calendars[0].title, "Remote calendar");
    const changed = structuredClone(local);
    if (paused === "planning") changed.schedule.campuses.Spring2027 = "LMA";
    else changed.schedule.calendars[0].title = "Local calendar";
    assert.ok(planConflicts(baseline, changed, remote).length);
  }
});

test("conflict detection aggregates earlier semester chunks and accepts regrouped unchanged courses", () => {
  let id = 0;
  const first = addPlanningCourse(
    emptyPlan(),
    { subject: "CSE", number: "2221" },
    "Spring2027",
    () => `course-${++id}`,
  );
  const base = addPlanningCourse(
    first,
    { subject: "MATH", number: "1151" },
    "Spring2027",
    () => `course-${++id}`,
  );
  const semester = base.semesters[0];
  assert.equal(semester.courses.length, 2);
  base.semesters = semester.courses.map((course) => ({
    ...semester,
    courses: [course],
  }));
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.semesters[0].courses[0].title = "Local title";
  remote.semesters[0].courses[0].title = "Cloud title";
  assert.deepEqual(planConflicts(base, local, remote), [
    "plan.semesters[].courses[].title",
  ]);
  const regrouped = structuredClone(base);
  regrouped.semesters = [
    { ...semester, courses: base.semesters.flatMap((row) => row.courses) },
  ];
  assert.deepEqual(planConflicts(base, local, regrouped), []);
});

test("identical subscription refreshes merge their freshness metadata without blocking user edits", () => {
  const base = fixture("Feed", "COL");
  base.schedule.calendars[0].kind = "feed";
  base.schedule.calendars[0].refreshedAt = "2026-11-18T00:00:00Z";
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.schedule.calendars[0].refreshedAt = "2026-11-19T01:00:00Z";
  remote.schedule.calendars[0].refreshedAt = "2026-11-19T02:00:00Z";
  local.schedule.campuses.Spring2027 = "MNS";
  assert.deepEqual(planConflicts(base, local, remote), []);
  const merged = reconcilePlans(base, local, remote);
  assert.equal(
    merged.schedule.calendars[0].refreshedAt,
    remote.schedule.calendars[0].refreshedAt,
  );
  assert.equal(merged.schedule.campuses.Spring2027, "MNS");
  local.schedule.calendars[0].title = "Local title";
  remote.schedule.calendars[0].title = "Remote title";
  assert.deepEqual(planConflicts(base, local, remote), [
    "plan.schedule.calendars[].title",
  ]);
});

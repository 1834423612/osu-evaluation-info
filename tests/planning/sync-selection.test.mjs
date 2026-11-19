import test from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import { calendarSchema } from "../../src/lib/calendar/model.ts";
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
  plan.campus = campus;
  return plan;
};
test("paused calendars preserve the cloud payload and the unsynced local calendar independently", () => {
  const local = fixture("Local edit", "mans"),
    cloud = fixture("Cloud edit", "col");
  const features = { favorites: true, planning: true, calendars: false };
  const upload = projectSyncPlan(local, cloud, features);
  assert.equal(upload.campus, "mans");
  assert.equal(upload.schedule.calendars[0].title, "Cloud edit");
  assert.equal(
    projectSyncPlan(cloud, local, features).schedule.calendars[0].title,
    "Local edit",
  );
  assert.equal(local.schedule.calendars[0].title, "Local edit");
  planSchema.parse(upload);
});
test("calendar-only sync preserves cloud planning and never turns an empty local plan into cloud deletion", () => {
  const cloud = fixture("Cloud", "col"),
    local = fixture("Local", "mans");
  const value = projectSyncPlan(local, cloud, {
    favorites: true,
    planning: false,
    calendars: true,
  });
  assert.equal(value.campus, "col");
  assert.equal(value.schedule.calendars[0].title, "Local");
  const removal = projectSyncPlan(null, cloud, {
    favorites: true,
    planning: false,
    calendars: true,
  });
  assert.equal(removal.campus, "col");
  assert.equal(removal.schedule.calendars, undefined);
  planSchema.parse(removal);
});
test("concurrent field edits require a decision while independent edits and identical values merge", () => {
  const base = fixture("Original", "col"),
    local = fixture("Local", "col"),
    cloud = fixture("Cloud", "col");
  assert.deepEqual(planConflicts(base, local, cloud), [
    "plan.schedule.calendars[].title",
  ]);
  assert.deepEqual(planConflicts(base, local, local), []);
  cloud.schedule.calendars[0].title = "Original";
  cloud.campus = "mans";
  assert.deepEqual(planConflicts(base, local, cloud), []);
});

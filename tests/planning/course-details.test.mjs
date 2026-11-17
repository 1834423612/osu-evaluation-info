import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (name) =>
  readFileSync(
    new URL("../../src/components/" + name, import.meta.url),
    "utf8",
  );
test("planning details reuse catalog sections, ratings, syllabus and seat watching", () => {
  const source = read("planning/course-detail-tabs.tsx");
  for (const component of [
    "SectionsPanel",
    "EvaluationPanel",
    "RmpPanel",
    "SyllabusPanel",
    "SeatWatchPanel",
    "CourseFees",
  ])
    assert.match(source, new RegExp("<" + component));
  assert.match(read("planning/course-inspector.tsx"), /<CourseDetailTabs/);
});
test("planning workspaces guard outside dismissal and support deliberate mobile handle dismissal", () => {
  const source = read("ui/workspace-dialog.tsx");
  assert.equal(
    (source.match(/if \(closeOnly\) event.preventDefault\(\)/g) ?? []).length,
    4,
  );
  assert.match(source, /if \(mobile && !closeOnly\)/);
  assert.match(source, /dismissible=\{!closeOnly\}/);
  assert.match(source, /data-slot="sheet-content"/);
  assert.match(source, /\{mobile && \(\s*<DrawerDismissHandle/);
  assert.match(source, /onDismiss=\{\(\) => change\(false\)\}/);
  assert.match(
    read("planning/semester-board.tsx"),
    /<WorkspaceDialog\s+closeOnly/,
  );
});

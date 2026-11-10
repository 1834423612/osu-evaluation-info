import assert from "node:assert/strict";
import test from "node:test";
import { extractSyllabusSchedule } from "../../src/lib/syllabus/insights.ts";

test("turns source week paragraphs into complete timeline entries and preserves legends", () => {
  const text =
    "Syllabus - Course Schedule\n* TIA is TechIn Action\nWeek 1- TIA Chapter 1 (Technology In a Changing Word)\nWeek 2 - TIA Chapter 2 (Looking at Computers: Understanding the Parts)\nWeek 3 - Go! PowerPoint Chapter 1";
  const result = extractSyllabusSchedule({
    title: "Course Schedule",
    text,
    html: `<h2>Syllabus - Course Schedule</h2>${text
      .split("\n")
      .slice(1)
      .map((p) => `<p>${p}</p>`)
      .join("")}`,
  });
  assert.equal(result.items.length, 3);
  assert.equal(result.note, "* TIA is TechIn Action");
  assert.equal(result.items[1].weekStart, 2);
  assert.equal(
    result.items[1].topic,
    "TIA Chapter 2 (Looking at Computers: Understanding the Parts)",
  );
});
test("keeps table ranges, overlapping weeks and original order while dropping empty rows", () => {
  const html =
    "<h2>Syllabus - Course Schedule</h2><table><tr><td>Week</td><td>Topic</td></tr><tr><td>11-12</td><td>Language</td></tr><tr><td>12</td><td>Exhibitions</td></tr><tr><td>13–16</td><td>Final project</td></tr><tr><td><br></td><td><br></td></tr></table>";
  const { items } = extractSyllabusSchedule({
    title: "Course Schedule",
    html,
    text: "",
  });
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((item) => [item.weekStart, item.weekEnd]),
    [
      [11, 12],
      [12, 12],
      [13, 16],
    ],
  );
});
test("retains dated schedules without inventing week numbers and leaves unstructured prose intact", () => {
  const html =
    "<table><tr><th>Date</th><th>Topic</th></tr><tr><td>Aug 26</td><td>Introduction &amp; questions</td></tr></table>";
  const { items } = extractSyllabusSchedule({
    title: "Calendar",
    html,
    text: "",
  });
  assert.equal(items[0].weekStart, null);
  assert.equal(items[0].topic, "Introduction & questions");
  assert.equal(
    extractSyllabusSchedule({
      title: "Schedule",
      html: "<p>The schedule will be announced.</p>",
      text: "The schedule will be announced.",
    }).items.length,
    0,
  );
});

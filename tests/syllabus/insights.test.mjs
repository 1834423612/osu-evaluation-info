import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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

test("HISTORY 2231 keeps weekly topics separate from dated reading lists and all source links", () => {
  const html = readFileSync(
    new URL("./history-schedule.fixture.html", import.meta.url),
    "utf8",
  );
  const { items } = extractSyllabusSchedule({
    title: "Course Schedule",
    html,
    text: "",
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].topic, "Introduction, Geography, and Sources");
  assert.equal(items[0].sessions.length, 2);
  assert.equal(items[0].sessions[0].label, "August 25th");
  assert.equal(
    items[0].sessions[0].blocks[0].parts[0].text,
    "No assigned readings",
  );
  assert.equal(items[0].sessions[1].label, "August 27th");
  assert.equal(items[0].sessions[1].blocks.length, 3);
  assert(
    items[0].sessions[1].blocks[0].parts[0].text.includes(
      "https://sourcebooks.fordham.edu/source/leo4-ind850.asp",
    ),
  );
  assert.equal(items[1].sessions[0].label, "September 1st");
  assert.equal(items[1].sessions[1].label, "September 3rd");
  assert(!items[0].topic.includes("August"));
});
test("date paragraphs and line breaks keep dates without invented weeks or swallowed linked readings", () => {
  const html =
    '<h2>Schedule</h2><p>Tue, Aug. 25: Introduction<br>Read the <a href="https://example.edu/reading">assigned chapter</a></p><p>27 August: Discussion</p><p>09/01: Quiz</p>';
  const { items } = extractSyllabusSchedule({
    title: "Schedule",
    html,
    text: "",
  });
  assert.deepEqual(
    items.map((item) => item.label),
    ["Tue, Aug. 25", "27 August", "09/01"],
  );
  assert(items.every((item) => item.weekStart === null));
  assert.equal(
    items[0].blocks[0].parts.find((part) => part.href)?.href,
    "https://example.edu/reading",
  );
  assert.equal(items[0].topic, "Introduction");
});
test("dates in readings are not interpreted as sessions and an empty weekly title retains its dates", () => {
  const html =
    "<p>Week 8:</p><p>October 13th: Mid-Term Exam.</p><ul><li>A history of May 18, 1096</li></ul><p>October 15th: Autumn Break, NO CLASS</p>";
  const { items } = extractSyllabusSchedule({
    title: "Schedule",
    html,
    text: "",
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].topic, "");
  assert.equal(items[0].sessions.length, 2);
  assert.equal(items[0].sessions[0].blocks.length, 2);
});

test("list-based schedules and topic links remain structured", () => {
  const { items } = extractSyllabusSchedule({
    title: "Schedule",
    text: "",
    html: '<ul><li>Week 1: Intro <a href="https://osu.edu/reading">reading</a></li><li>August 25: Discussion</li><li>Week 2: Questions</li></ul>',
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].sessions[0].label, "August 25");
  assert.equal(
    items[0].topicParts.find((part) => part.href)?.href,
    "https://osu.edu/reading",
  );
});

test("serialized week paragraphs, W ranges, modules and explicitly headed bare weeks do not merge", () => {
  const parse = (html) =>
    extractSyllabusSchedule({ title: "Schedule", html, text: "" }).items;
  const inline = parse(
    "<p>weeks 1-2 scientific revolution; week 3 chemistry/geology; week 4 biology</p>",
  );
  assert.equal(inline.length, 3);
  assert.equal(inline[0].topic, "scientific revolution");
  assert.equal(inline[2].weekStart, 4);
  assert.deepEqual(
    parse("<p>W1-2 Tuning our Attention</p><p>W3-4 Tuning into Others</p>").map(
      (i) => i.weekEnd,
    ),
    [2, 4],
  );
  const modules = parse(
    "<p>Module 00: Introductions</p><p>Module 1: Theories</p>",
  );
  assert.equal(modules.length, 2);
  assert(modules.every((i) => i.weekStart === null));
  assert.equal(modules[0].topic, "Introductions");
  const bare = parse(
    "<p>Week and topic</p><p>1-2 development of work plan</p><p>3-13 regular meetings</p>",
  );
  assert.equal(bare.length, 2);
  assert.equal(bare[1].weekEnd, 13);
  const dates = parse(
    "<p>August 26. E100. Intro</p><p>September 2. E100. PM Week</p>",
  );
  assert.equal(dates.length, 2);
  assert.equal(dates[0].topic, "E100. Intro");
});

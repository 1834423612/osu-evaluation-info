import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
const lines = (...text) => text.map((text) => ({ text, page: 1 }));
test("synthetic plan preserves unknown credits and reported semester total", () => {
  const { plan } = parsePlanLines(
    lines(
      "Student Name: PRIVATE 1234",
      "Spring 2027 13h",
      "CSE 2111 3h Planned",
      ...Array(4).fill("Placeholder - Planned"),
    ),
    "student-plan",
  );
  assert.equal(plan.semesters[0].reportedCredits, 13);
  assert.equal(plan.semesters[0].courses.length, 5);
  assert.equal(plan.semesters[0].courses[1].credits, null);
  assert.equal(plan.reviewed, false);
  assert.doesNotMatch(JSON.stringify(plan), /PRIVATE/);
});
test("placeholder can have a course code; planned is not registration evidence", () => {
  const { plan } = parsePlanLines(
    lines("ECON 2001 Placeholder Planned Registered"),
    "student-plan",
  );
  assert.equal(plan.semesters[0].courses[0].kind, "placeholder");
  assert.equal(plan.semesters[0].courses[0].status, "planned");
});
test("audits do not assign ambiguous terms or double count requirement occurrences", () => {
  const { plan, warnings } = parsePlanLines(
    lines(
      "Autumn 2026",
      "CSE 2111 3h",
      "CSE 2111 3h",
      "Applied Version AU2017",
      "Catalog Term Autumn2026",
    ),
    "compact-audit",
  );
  assert.equal(plan.semesters[0].term, null);
  assert.equal(plan.semesters[0].courses.length, 1);
  assert.equal(plan.appliedVersion, "AU2017");
  assert.equal(plan.catalogTerm, "Autumn2026");
  assert.ok(warnings.includes("limited"));
});
test("conflicting versions remain unknown and unknown format is empty", () => {
  assert.equal(
    parsePlanLines(
      lines("Applied Version AU2017", "Applied Version AU2022"),
      "expanded-audit",
    ).plan.appliedVersion,
    null,
  );
  assert.ok(
    parsePlanLines(
      lines("unrecognized output"),
      "student-plan",
    ).warnings.includes("empty"),
  );
});

test("browser print cannot silently inherit export semester order", () => {
  const { plan } = parsePlanLines(
    lines("Spring 2027 13h", "CSE 2111 3h"),
    "student-plan",
    "browser-print",
  );
  assert.equal(plan.pdfOrigin, "browser-print");
  assert.equal(plan.semesters[0].term, null);
});

test("oversized candidate sets fail rather than silently truncate", () => {
  assert.throws(
    () =>
      parsePlanLines(
        lines(...Array(101).fill("Placeholder -")),
        "student-plan",
      ),
    /Too many/,
  );
});

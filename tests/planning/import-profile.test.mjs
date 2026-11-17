import { test } from "node:test";
import assert from "node:assert/strict";
import {
  importProfile,
  importCoverage,
} from "../../src/lib/planning/import-profile.ts";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import {
  parsePlanLines,
  detectPlanLayout,
} from "../../src/lib/planning/parser.ts";

test("recommended reports keep explicit view separate from PDF layout", () => {
  assert.deepEqual(importProfile("official"), {
    source: "auto",
    origin: "browser-print",
    auditMode: "official",
  });
  const plan = emptyPlan();
  plan.documents = [
    {
      id: "one",
      source: "expanded-audit",
      auditMode: "official",
      pdfOrigin: "browser-print",
      catalogTerm: null,
    },
  ];
  assert.equal(importCoverage(plan).official, true);
  assert.equal(importCoverage(plan).planned, false);
  plan.documents[0].source = "standard-audit";
  assert.equal(importCoverage(plan).official, false);
  assert.equal(importCoverage(plan).outlineOnly, true);
});

test("not-declared and Planned-only headers retain academic codes without inferring enrollment", () => {
  const { plan } = parsePlanLines(
    [
      "Synthetic program - EXAMPLE-BA (not declared)",
      "01 General Education Requirements - AU2026",
      "Fulfill all of the following requirements",
      "Another program - TEST-BS Only available in Planned View",
    ].map((text) => ({ text, page: 1 })),
    "expanded-audit",
  );
  assert.equal(
    plan.programs.find((p) => p.code === "EXAMPLE-BA").declaration,
    "undeclared",
  );
  assert.equal(
    plan.programs.find((p) => p.code === "TEST-BS").declaration,
    "undeclared",
  );
  assert.equal(
    plan.programs.find((p) => p.code === "GE").declaration,
    "unknown",
  );
  assert.equal(plan.auditMode, "official");
});

test("Planned-only program notices identify an Official export", () => {
  const result = parsePlanLines(
    [
      {
        text: "Computer Science - CSE-BS Only available in Planned View",
        page: 1,
      },
    ],
    "expanded-audit",
  );
  assert.equal(result.plan.auditMode, "official");
  assert.equal(result.plan.documents[0].auditMode, "official");
});

test("content detection ignores misleading names and preserves semester campus and W", () => {
  const lines = [
    "Student Plan",
    "Course or Activity",
    "Autumn 2026",
    "Mansfield",
    "MATH 1131 Calculus 5 hours W",
  ].map((text) => ({ text, page: 1 }));
  assert.equal(
    detectPlanLayout(lines, "Official_Expanded.pdf"),
    "student-plan",
  );
  const { plan } = parsePlanLines(lines, "student-plan");
  assert.equal(plan.semesters[0].campus, "MNS");
  assert.equal(plan.semesters[0].courses[0].status, "withdrawn");
  assert.equal(
    detectPlanLayout(
      [{ text: "unrelated content", page: 1 }],
      "Student_Plan.pdf",
    ),
    null,
  );
});

test("full undeclared target requirements identify Planned from report content", () => {
  const lines = [
    "AUDIT REPORT",
    "Synthetic target - TARGET-BA (not declared)",
    "Major Core (Courses: (1 remaining))",
    "–– CSE 2998 Synthetic course (3 hours) remaining",
  ].map((text) => ({ text, page: 1 }));
  const { plan } = parsePlanLines(lines, "standard-audit");
  assert.equal(plan.auditMode, "planned");
  assert.equal(plan.documents[0].auditMode, "planned");
  const headerOnly = parsePlanLines(lines.slice(0, 2), "standard-audit").plan;
  assert.equal(headerOnly.auditMode, "unknown");
});

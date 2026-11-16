import { test } from "node:test";
import assert from "node:assert/strict";
import {
  academicResponses,
  academicEvidence,
  compareAcademicEvidence,
} from "./private-har.mjs";
test("offline HAR comparison reads response JSON and discards identity and credentials", () => {
  const data = {
    semesters: [
      {
        physical_year: 2028,
        courses: [{ code: "MATH 1151", units: 5, name: "Private", grade: "A" }],
        placeholders: [{}],
      },
    ],
    req_trees: {},
    audit_reqs: {},
  };
  const archive = {
    log: {
      entries: [
        {
          request: { cookies: [{ value: "secret" }] },
          response: { content: { text: ")]}'\n" + JSON.stringify(data) } },
        },
        {
          response: {
            content: {
              text: Buffer.from(JSON.stringify({})).toString("base64"),
              encoding: "base64",
            },
          },
        },
      ],
    },
  };
  const responses = academicResponses(archive);
  assert.equal(responses.length, 2);
  const evidence = academicEvidence(responses);
  assert.doesNotMatch(JSON.stringify(evidence), /Private|secret|grade/);
  const report = compareAcademicEvidence(
    {
      semesters: [
        {
          term: "Autumn 2028",
          courses: [{ subject: "MATH", number: "1151", credits: 5 }],
        },
      ],
    },
    evidence,
  );
  assert.equal(report.matchingCredits, 1);
  assert.equal(report.matchingCalendarYears, 1);
  assert.equal(report.harPlaceholderObservations, 1);
  assert.doesNotMatch(JSON.stringify(report), /MATH|1151|2028/);
});
test("ambiguous repeated courses are excluded from agreement denominators", () => {
  const course = { subject: "MATH", number: "1151", credits: 5 };
  const report = compareAcademicEvidence(
    { semesters: [{ courses: [course, course] }] },
    {
      semesters: [{ courses: [{ code: "MATH1151", credits: 5 }] }],
      requirementSnapshots: 0,
      auditSnapshots: 0,
    },
  );
  assert.equal(report.comparableCourseObservations, 0);
  assert.equal(report.ambiguousOrMissingCourseObservations, 1);
});

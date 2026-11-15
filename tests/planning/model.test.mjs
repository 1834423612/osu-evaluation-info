import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyPlan,
  serializePlan,
  planSchema,
  savePlan,
  courseSearchHref,
} from "../../src/lib/planning/model.ts";

test("exports whitelist fields and requires review", () => {
  const plan = {
    ...emptyPlan(),
    name: "Private Student",
    email: "student@example.org",
    rawText: "secret",
    filename: "secret.pdf",
  };
  assert.throws(() => serializePlan(plan), /Review/);
  const output = serializePlan({ ...plan, reviewed: true });
  assert.doesNotMatch(output, /Private|secret|email|filename|rawText/);
});
test("unknown credits stay null; requirement and catalog terms remain distinct", () => {
  const result = planSchema.parse({
    ...emptyPlan(),
    appliedVersion: "AU2017",
    catalogTerm: "Autumn2026",
    semesters: [
      {
        term: "Spring2027",
        reportedCredits: 13,
        courses: Array.from({ length: 4 }, () => ({
          kind: "placeholder",
          subject: null,
          number: null,
          credits: null,
          status: "planned",
          page: 1,
        })),
      },
    ],
  });
  assert.equal(result.semesters[0].courses[0].credits, null);
  assert.equal(result.semesters[0].reportedCredits, 13);
  assert.equal(result.appliedVersion, "AU2017");
  assert.equal(result.catalogTerm, "Autumn2026");
});
test("storage failure propagates; no false success", () => {
  assert.throws(
    () =>
      savePlan(
        {
          setItem() {
            throw Error("quota");
          },
        },
        { ...emptyPlan(), reviewed: true },
      ),
    /quota/,
  );
});
test("course links reuse search and reject arbitrary free text", () => {
  const course = {
    kind: "course",
    subject: "CSE",
    number: "2111",
    credits: 3,
    status: "planned",
    page: 1,
  };
  assert.equal(courseSearchHref(course), "/?q=CSE+2111");
  assert.throws(() =>
    courseSearchHref({ ...course, subject: "student@example.org" }),
  );
  assert.equal(
    courseSearchHref({
      ...course,
      kind: "placeholder",
      subject: null,
      number: null,
    }),
    null,
  );
});

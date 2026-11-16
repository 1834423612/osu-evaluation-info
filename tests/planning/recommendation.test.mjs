import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import {
  recommendCourses,
  applyRecommendationBundle,
  ratingRequest,
} from "../../src/lib/planning/recommendation.ts";
import {
  publicSamples,
  sampleReferenceReader,
} from "../../src/lib/planning/public-samples.ts";
import { readFile } from "node:fs/promises";
const options = {
  programId: "p",
  currentTerm: "Autumn2026",
  targetTerm: "Spring2027",
  sampleYear: 1,
  maxCredits: 6,
  quantitativeSubjects: ["MATH"],
  maxQuantitative: 1,
};
function fixture() {
  const plan = emptyPlan();
  plan.documents = [
    {
      id: "d",
      source: "standard-audit",
      pdfOrigin: "export",
      auditMode: "official",
      catalogTerm: null,
    },
  ];
  plan.programs = [
    {
      id: "p",
      documentId: "d",
      code: "TEST-BA",
      declaration: "declared",
      appliedVersion: "AU2026",
      catalogTerm: null,
      remainingCredits: null,
    },
  ];
  plan.requirements = [
    {
      id: "r",
      documentId: "d",
      programId: "p",
      parentId: null,
      kind: "courses",
      minimumCredits: null,
      minimumCourses: 1,
      alternatives: [
        { subject: "MATH", number: "1151" },
        { subject: "CSE", number: "1223" },
      ],
      page: 1,
      hierarchyReviewed: true,
    },
  ];
  plan.semesters = [
    {
      documentId: "d",
      term: null,
      reportedCredits: null,
      courses: [
        {
          id: "m",
          documentId: "d",
          subject: "MATH",
          number: "1151",
          credits: 5,
          status: "planned",
          kind: "course",
          evidenceRole: "observation",
          page: 1,
        },
        {
          id: "c",
          documentId: "d",
          subject: "CSE",
          number: "1223",
          credits: 3,
          status: "planned",
          kind: "course",
          evidenceRole: "observation",
          page: 1,
        },
        {
          id: "e",
          documentId: "d",
          subject: "ENGLISH",
          number: "1110",
          credits: 3,
          status: "completed",
          kind: "course",
          evidenceRole: "observation",
          page: 1,
        },
        {
          id: "u",
          documentId: "d",
          subject: "STAT",
          number: "3201",
          credits: null,
          status: "planned",
          kind: "course",
          evidenceRole: "observation",
          page: 1,
        },
      ],
    },
  ];
  return planSchema.parse(plan);
}
test("recommendation respects quantitative and credit caps, excludes completed and unknown-credit packs", () => {
  const plan = fixture();
  const result = recommendCourses(plan, { ...options, maxQuantitative: 0 });
  assert.deepEqual(
    result.bundle.map((c) => c.key),
    ["CSE 1223"],
  );
  assert.ok(result.candidates.some((c) => c.key === "STAT 3201"));
  assert.ok(!result.candidates.some((c) => c.key === "ENGLISH 1110"));
  assert.throws(
    () =>
      recommendCourses(plan, { ...options, targetTerm: options.currentTerm }),
    /later|after/,
  );
  plan.allocations = [{ courseId: "c", requirementId: "r", confirmed: true }];
  plan.semesters[0].courses[1].status = "completed";
  const satisfied = recommendCourses(plan, options).candidates.find(
    (c) => c.subject === "MATH",
  );
  assert.equal(satisfied.ruleIds.length, 0);
});
test("ratings stay separate by instrument, shrink small samples and whitelist requests", () => {
  const result = recommendCourses(fixture(), {
    ...options,
    ratings: {
      "CSE 1223": { score: 5, responses: 1, instrument: "SSLE" },
      "MATH 1151": { score: 4.5, responses: 100, instrument: "SEI" },
    },
  });
  assert.equal(result.candidates[0].key, "MATH 1151");
  const body = ratingRequest(result.candidates, "COL");
  assert.doesNotMatch(
    JSON.stringify(body),
    /documentId|programId|term|status|credit|semester|appliedVersion/,
  );
  assert.throws(() => ratingRequest([], "invalid"));
});
test("applying a suggestion keeps source observations unchanged and reuses manual courses", () => {
  const original = fixture(),
    result = recommendCourses(original, options);
  let n = 0;
  const first = applyRecommendationBundle(
    original,
    result.bundle,
    options.targetTerm,
    () => "new-" + ++n,
  );
  assert.deepEqual(first.semesters[0], original.semesters[0]);
  const second = applyRecommendationBundle(
    first,
    result.bundle,
    "Autumn2027",
    () => "new-" + ++n,
  );
  assert.equal(
    second.semesters.flatMap((s) => s.courses).length,
    first.semesters.flatMap((s) => s.courses).length,
  );
  assert.equal(second.reviewed, false);
  assert.equal(second.schedule.placements[0].term, "Autumn2027");
});
test("public samples expose course evidence without assigning a bundle's credits to alternatives", async () => {
  const curricula = JSON.parse(
    await readFile(
      new URL("../../data/planning/curricula.json", import.meta.url),
      "utf8",
    ),
  );
  const subjects = JSON.parse(
    await readFile(
      new URL("../../data/planning/subjects.json", import.meta.url),
      "utf8",
    ),
  );
  const samples = publicSamples(curricula, subjects.subjects);
  assert.ok(samples.length >= 4);
  assert.notEqual(samples[0].label, samples[1].label);
  assert.ok(samples.some((s) => s.courses.some((c) => c.subject === "MATH")));
  const sample = {
    ...curricula[0],
    semesters: [
      {
        entries: [
          { evidence: "MATH 1151 or CSE 1223", credits: { min: 8, max: 8 } },
        ],
      },
    ],
  };
  assert.ok(
    publicSamples([sample], subjects.subjects)[0].courses.every(
      (c) => c.credits === null,
    ),
  );
});

test("future-only sample courses stay out of an earlier semester combination", () => {
  const result = recommendCourses(fixture(), {
    ...options,
    sample: {
      id: "sample",
      program: "Synthetic",
      url: "https://example.osu.edu/sample",
      reviewStatus: "pending",
      courses: [
        { subject: "ARTSSCI", number: "1100", credits: 1, semesterIndex: 7 },
        { subject: "CHEM", number: "1220", credits: 2, semesterIndex: 1 },
      ],
    },
  });
  assert.ok(result.candidates.some((c) => c.key === "ARTSSCI 1100"));
  assert.ok(!result.bundle.some((c) => c.key === "ARTSSCI 1100"));
});

test("catalog credits drive estimates without rewriting imported academic facts", () => {
  const plan = fixture();
  const result = recommendCourses(plan, {
    ...options,
    catalogCredits: {
      "CSE 1223": { min: 4, max: 4 },
      "STAT 3201": { min: 1, max: 6 },
    },
  });
  assert.equal(result.candidates.find((c) => c.key === "CSE 1223").credits, 4);
  assert.equal(
    result.candidates.find((c) => c.key === "STAT 3201").credits,
    null,
  );
  assert.equal(plan.semesters[0].courses[1].credits, 3);
});

test("recommendation placement reuses imported planned courses", () => {
  const plan = fixture();
  let count = 0;
  const result = recommendCourses(plan, options);
  const next = applyRecommendationBundle(
    plan,
    result.bundle,
    options.targetTerm,
    () => "new-" + ++count,
  );
  assert.equal(next.semesters.flatMap((s) => s.courses).length, 4);
  assert.deepEqual(next.semesters, plan.semesters);
  assert.equal(next.schedule.placements.length, result.bundle.length);
});

test("conditional exclusions do not become sample course suggestions", () => {
  const references = sampleReferenceReader([
    { code: "PHILOS", title: "Philosophy" },
  ]);
  assert.deepEqual(references("[GE-Theme if not PHILOS 2338] — [4] hours"), []);
  assert.deepEqual(references("PHILOS 2338 — 4 hours"), [
    { subject: "PHILOS", number: "2338" },
  ]);
});

test("recommendation caps include courses already placed in the target semester", () => {
  const plan = fixture();
  plan.schedule.placements = [{ courseId: "m", term: options.targetTerm }];
  const tight = recommendCourses(plan, options);
  assert.equal(tight.existingCredits, 5);
  assert.equal(tight.credits, 5);
  assert.equal(tight.bundle.length, 0);
  const room = recommendCourses(plan, {
    ...options,
    maxCredits: 8,
    maxQuantitative: 2,
  });
  assert.equal(room.credits, 8);
  assert.deepEqual(
    room.bundle.map((c) => c.key),
    ["CSE 1223"],
  );
  plan.schedule.placements.push({ courseId: "u", term: options.targetTerm });
  const unknown = recommendCourses(plan, { ...options, maxCredits: 18 });
  assert.equal(unknown.unresolvedExisting, 1);
  assert.equal(unknown.bundle.length, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import {
  actionableRequirements,
  assignRequirement,
  requirementCoverage,
  createAlternativeGroup,
  moveCourseGroup,
} from "../../src/lib/planning/groups.ts";
import {
  addPlanningCourse,
  boardCourses,
} from "../../src/lib/planning/workspace.ts";
import { replaceImportedReports } from "../../src/lib/planning/reimport.ts";
let ordinal = 0;
const id = () => "id-" + ++ordinal;
function fixture() {
  const p = emptyPlan();
  p.documents = [
    {
      id: "d",
      source: "expanded-audit",
      auditMode: "planned",
      catalogTerm: null,
      pdfOrigin: "export",
    },
  ];
  p.programs = [
    {
      id: "p",
      documentId: "d",
      code: "TEST-BA",
      appliedVersion: "AU2022",
      catalogTerm: null,
      declaration: "undeclared",
      remainingCredits: null,
    },
  ];
  p.requirements = [
    {
      id: "r",
      documentId: "d",
      programId: "p",
      parentId: null,
      title: "Natural Science",
      kind: "courses",
      minimumCourses: 2,
      minimumCredits: 6,
      alternatives: [],
      page: 1,
      reportedStatus: "remaining",
    },
  ];
  return p;
}
test("requirement groups retain a placeholder until both course and credit quotas are met", () => {
  let p = assignRequirement(
    fixture(),
    "r",
    { subject: "CHEM", number: "1210" },
    "Spring2027",
    3,
    id,
  );
  assert.equal(requirementCoverage(p, "r").fulfilled, false);
  p = assignRequirement(
    p,
    "r",
    { subject: "PHYSICS", number: "1250" },
    "Autumn2027",
    3,
    id,
  );
  assert.equal(requirementCoverage(p, "r").count, 2);
  assert.equal(requirementCoverage(p, "r").fulfilled, true);
  p = assignRequirement(
    p,
    "r",
    { subject: "PHYSICS", number: "1250" },
    "Autumn2027",
    3,
    id,
  );
  assert.equal(requirementCoverage(p, "r").count, 2);
});
test("alternatives contribute only their selected course to the board and simulation", () => {
  let p = addPlanningCourse(
    emptyPlan(),
    { subject: "ART", number: "2300" },
    "Spring2027",
    id,
  );
  p = addPlanningCourse(
    p,
    { subject: "MUSIC", number: "1101" },
    "Spring2027",
    id,
  );
  p = createAlternativeGroup(
    p,
    p.semesters.flatMap((s) => s.courses.map((c) => c.id)),
    "Spring2027",
    id,
  );
  assert.equal(boardCourses(p).length, 0);
  p.schedule.groups[0].selectedCourseId = p.schedule.groups[0].courseIds[1];
  assert.equal(boardCourses(p)[0].course.subject, "MUSIC");
  p = moveCourseGroup(p, p.schedule.groups[0].id, "Autumn2027");
  assert.equal(boardCourses(p)[0].term, "Autumn2027");
  assert.ok(planSchema.safeParse(p).success);
});
test("repeated imports update requirements without multiplying reports or losing local choices", () => {
  let p = assignRequirement(
    fixture(),
    "r",
    { subject: "CHEM", number: "1210" },
    "Spring2027",
    3,
    id,
  );
  for (let i = 0; i < 25; i++) {
    const incoming = fixture();
    incoming.requirements[0].minimumCredits = 7;
    p = replaceImportedReports(p, incoming);
  }
  assert.equal(p.documents.length, 2);
  assert.equal(p.requirements.length, 1);
  assert.equal(p.requirements[0].minimumCredits, 7);
  assert.equal(p.schedule.groups.length, 1);
  assert.equal(requirementCoverage(p, p.requirements[0].id).count, 1);
  assert.equal(boardCourses(p)[0].term, "Spring2027");
  assert.ok(planSchema.safeParse(p).success);
});

test("pending requirements combine duplicate views and retain a choice parent", () => {
  const p = fixture();
  p.requirements[0].kind = "any";
  p.requirements[0].minimumCourses = null;
  p.requirements[0].minimumCredits = null;
  p.requirements.push({
    ...p.requirements[0],
    id: "child",
    parentId: "r",
    title: "Natural Science",
    kind: "credits",
    minimumCredits: 4,
  });
  p.documents.push({
    ...p.documents[0],
    id: "official",
    auditMode: "official",
  });
  p.programs.push({
    ...p.programs[0],
    id: "official-program",
    documentId: "official",
  });
  p.requirements.push({
    ...p.requirements[0],
    id: "duplicate",
    documentId: "official",
    programId: "official-program",
  });
  assert.deepEqual(
    actionableRequirements(p).map((r) => r.id),
    ["r"],
  );
  let next = assignRequirement(
    p,
    "child",
    { subject: "CHEM", number: "1210" },
    "Spring2027",
    3,
    id,
  );
  assert.equal(requirementCoverage(next, "r").fulfilled, false);
  next = assignRequirement(
    next,
    "child",
    { subject: "CHEM", number: "1220" },
    "Spring2027",
    3,
    id,
  );
  assert.equal(requirementCoverage(next, "r").fulfilled, true);
});
test("a completed alternative stays visible after a later report update", () => {
  let p = addPlanningCourse(
    emptyPlan(),
    { subject: "ART", number: "2300" },
    "Spring2027",
    id,
  );
  p = addPlanningCourse(
    p,
    { subject: "MUSIC", number: "1101" },
    "Spring2027",
    id,
  );
  p = createAlternativeGroup(
    p,
    p.semesters.flatMap((s) => s.courses.map((c) => c.id)),
    "Spring2027",
    id,
  );
  p.semesters[0].courses[0].status = "completed";
  assert.equal(boardCourses(p).length, 1);
  assert.equal(boardCourses(p)[0].course.status, "completed");
});

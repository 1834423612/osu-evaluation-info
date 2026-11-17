import { test } from "node:test";
import assert from "node:assert/strict";
import {
  programTemplate,
  templateSchema,
} from "../../src/lib/planning/template.ts";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
test("seed exports contain reviewed requirement rules without personal observations", () => {
  const { plan } = parsePlanLines(
    [
      "Program: SYNTHETIC-BA",
      "Applied Version: AU2022",
      "Requirement 1: All of",
      "Requirement 1.1: Choose 1 course",
      "CSE 2999",
    ].map((text) => ({ text, page: 1 })),
    "expanded-audit",
  );
  const id = plan.programs[0].id;
  assert.throws(() => programTemplate(plan, id), /Review/);
  plan.reviewed = true;
  plan.requirements.forEach((r) => {
    r.hierarchyReviewed = true;
  });
  const template = programTemplate(plan, id);
  assert.equal(template.rules[1].parentId, "rule-1");
  assert.equal(template.appliedVersion, "AU2022");
  assert.doesNotMatch(
    JSON.stringify(template),
    /document|semester|courseId|allocation|status|remainingCredits|page|declaration/,
  );
  assert.equal(
    templateSchema.safeParse({ ...template, studentId: "PRIVATE" }).success,
    false,
  );
  assert.equal(
    templateSchema.safeParse({
      ...template,
      rules: [{ ...template.rules[0], parentId: "rule-1" }],
    }).success,
    false,
  );
});

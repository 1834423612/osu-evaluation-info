import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
import { genericRequirementTemplates } from "../../src/lib/planning/generic-template.ts";
const sample = () =>
  parsePlanLines(
    [
      "Synthetic major - SYNTHETIC-BA (not declared)",
      "Applied Version: AU2026",
      "Major Core (Courses: (1 remaining))",
      "–– CSE 2998 Synthetic course (3 hours) remaining",
    ].map((text) => ({ text, page: 1 })),
    "standard-audit",
  ).plan;
test("generic templates omit observed and legacy-unverified course alternatives", () => {
  const plan = parsePlanLines(
    [
      "Synthetic major - SYNTHETIC-BA (not declared)",
      "Applied Version: AU2026",
      "Writing (through ENGLISH 2999 Synthetic private course) (Courses: (1 taken))",
      "–– CSE 2998 Synthetic option (3 hours) remaining",
    ].map((text) => ({ text, page: 1 })),
    "standard-audit",
  ).plan;
  plan.requirements[0].alternatives.push({ subject: "ART", number: "3999" });
  const encoded = JSON.stringify(genericRequirementTemplates(plan));
  assert.doesNotMatch(encoded, /2999|3999|Synthetic private/);
  assert.match(encoded, /2998/);
  const intermediate = structuredClone(plan);
  intermediate.allocations = [];
  intermediate.semesters = [];
  const template = genericRequirementTemplates(plan)[0];
  intermediate.requirements = template.requirements.map((rule) => ({
    ...rule,
    documentId: plan.documents[0].id,
    programId: plan.programs[0].id,
    page: null,
  }));
  assert.deepEqual(genericRequirementTemplates(intermediate), [template]);
});
test("generic trees preserve requirements while removing all student observations and identifiers", () => {
  const plan = sample();
  plan.requirements.push({
    ...plan.requirements[0],
    id: "unmatched-private",
    title: "Unmatched courses",
    alternatives: [{ subject: "ART", number: "2999" }],
  });
  plan.requirements.push({
    ...plan.requirements[0],
    id: "unmatched-child",
    parentId: "unmatched-private",
    title: "Personal unmatched course",
    alternatives: [{ subject: "ART", number: "3999" }],
  });
  const templates = genericRequirementTemplates({
    ...plan,
    studentName: "Private Person",
    email: "private@example.org",
  });
  assert.equal(templates.length, 1);
  assert.equal(templates[0].programCode, "SYNTHETIC-BA");
  assert.equal(templates[0].appliedVersion, "AU2026");
  assert.ok(templates[0].requirements.length);
  assert.doesNotMatch(
    JSON.stringify(templates),
    /Private Person|example.org|2999|3999|Unmatched|Personal unmatched|documentId|programId|reportedStatus|declaration|allocations|semesters|page|remainingCredits/,
  );
  for (const rule of templates[0].requirements)
    assert.ok(
      rule.parentId === null ||
        templates[0].requirements.some((parent) => parent.id === rule.parentId),
    );
});
test("planning database stores isolated backups, rejects stale edits, retries safely and deduplicates generic trees", async () => {
  const db = new PGlite();
  process.env.USER_DATA_SCHEMA = "osu_planning_cloud_test";
  process.env.DATABASE_URL = "postgresql://synthetic.invalid/test";
  process.env.USER_DATA_SECRET = "synthetic-planning-test-secret-000000000000";
  const { domainSQL } = await import("../../src/lib/user-data/namespace.ts");
  const query = async (sql, values) => {
    const result = await db.query(sql, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  global.osuEvaluationPool = {
    query,
    connect: async () => ({ query, release() {} }),
  };
  try {
    await db.exec("CREATE SCHEMA osu_planning_cloud_test");
    await db.exec(
      "CREATE TABLE osu_planning_cloud_test.rate_bucket (bucket text,window_start bigint,hits int,expires_at timestamptz,PRIMARY KEY(bucket,window_start))",
    );
    await db.exec(
      domainSQL(
        await readFile(
          new URL("../../db/migrations/20261116_planning.sql", import.meta.url),
          "utf8",
        ),
      ),
    );
    const {
      readPlanningBackup,
      writePlanningBackup,
      saveRequirementTemplates,
    } = await import("../../src/lib/planning/cloud.ts");
    const plan = sample();
    plan.schedule.campuses = { Spring2027: "MNS", Autumn2027: "COL" };
    const first = await writePlanningBackup("account-a", 0, plan);
    assert.equal(first.version, 1);
    assert.equal((await readPlanningBackup("account-b")).plan, null);
    assert.equal((await writePlanningBackup("account-a", 0, plan)).version, 1);
    const reordered = structuredClone(plan);
    reordered.schedule.campuses = { Autumn2027: "COL", Spring2027: "MNS" };
    assert.equal(
      (await writePlanningBackup("account-a", 0, reordered)).version,
      1,
    );
    const changed = { ...plan, hiddenPrograms: ["SYNTHETIC-BA"] };
    await assert.rejects(
      writePlanningBackup("account-a", 0, changed),
      (error) => error.code === "planning_conflict",
    );
    assert.equal((await readPlanningBackup("account-a")).version, 1);
    await writePlanningBackup("account-a", 1, changed);
    await assert.rejects(
      writePlanningBackup("account-a", 1, null),
      (error) => error.code === "planning_conflict",
    );
    const deleted = await writePlanningBackup("account-a", 2, null);
    assert.equal(deleted.version, 3);
    assert.equal(deleted.plan, null);
    await assert.rejects(
      writePlanningBackup("account-a", 0, plan),
      (error) => error.code === "planning_conflict",
    );
    assert.equal((await saveRequirementTemplates("account-a", plan)).stored, 1);
    assert.equal((await saveRequirementTemplates("account-b", plan)).stored, 0);
    const rows = (
      await db.query(
        "SELECT * FROM osu_planning_cloud_test.requirement_template",
      )
    ).rows;
    assert.equal(rows.length, 1);
    assert.doesNotMatch(
      JSON.stringify(rows),
      /account-a|account-b|reportedStatus|documentId/,
    );
  } finally {
    global.osuEvaluationPool = undefined;
    await db.close();
  }
});

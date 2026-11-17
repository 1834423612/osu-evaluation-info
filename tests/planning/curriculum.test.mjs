import { test } from "node:test";
import assert from "node:assert/strict";
import { planningSchema } from "../../src/lib/planning/namespace.ts";
import { curriculumSchema } from "../../src/lib/planning/curriculum.ts";
test("planning namespace is isolated and rejects SQL injection", () => {
  assert.equal(planningSchema({}), "osu_planning_dev");
  assert.equal(planningSchema({ NODE_ENV: "production" }), "osu_planning");
  assert.throws(() => planningSchema({ PLANNING_SCHEMA: "osu_identity" }));
  assert.throws(() => planningSchema({ PLANNING_SCHEMA: "osu_planning;DROP" }));
});
test("official imports cannot contain private plan payloads", () => {
  assert.equal(
    curriculumSchema.safeParse({ name: "Student", rawText: "private" }).success,
    false,
  );
});

test("checked-in official candidates validate and remain explicitly pending", async () => {
  const { readFile } = await import("node:fs/promises");
  const rows = JSON.parse(
    await readFile(
      new URL("../../data/planning/curricula.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  assert.equal(
    new Set(
      rows.map((r) =>
        [r.source.sha256, r.source.url, r.program, r.version].join("|"),
      ),
    ).size,
    rows.length,
  );
  for (const row of rows) {
    const parsed = curriculumSchema.parse(row);
    assert.equal(parsed.reviewStatus, "pending");
    assert.ok(parsed.semesters.length >= 8 && parsed.semesters.length <= 20);
    assert.ok(parsed.semesters.every((s) => s.entries.length > 0));
    assert.equal(parsed.applicableUntil, null);
  }
});

test("drafts cannot become approved requirements and academic years remain independent", async () => {
  const { readFile } = await import("node:fs/promises");
  const [source] = JSON.parse(
    await readFile(
      new URL("../../data/planning/curricula.json", import.meta.url),
      "utf8",
    ),
  );
  const candidate = {
    ...source,
    publicationStatus: "draft",
    planScope: "multi-program",
    academicYear: "2026-2027",
    documentKind: "requirements",
    reviewStatus: "approved",
    reviewer: "synthetic reviewer",
    reviewedAt: "2026-01-01T00:00:00Z",
    source: { ...source.source, validatedAt: "2026-01-01T00:00:00Z" },
  };
  assert.equal(curriculumSchema.safeParse(candidate).success, false);
  const parsed = curriculumSchema.parse({
    ...candidate,
    documentKind: "sample-plan",
    reviewStatus: "pending",
  });
  assert.equal(parsed.academicYear, "2026-2027");
  assert.equal(parsed.planScope, "multi-program");
  assert.equal(parsed.applicableUntil, null);
});

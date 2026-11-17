import assert from "node:assert/strict";
import test from "node:test";
import { emptyPlan, serializePlan } from "../../src/lib/planning/model.ts";
import { readPlanBackup } from "../../src/lib/planning/backup.ts";
const file = (plan) => ({ size: 100, text: async () => JSON.stringify(plan) });
const signal = () => new AbortController().signal;
test("backup restores complete settings and stable IDs without database identifiers", async () => {
  const plan = emptyPlan();
  plan.schedule = {
    terms: ["Autumn2028"],
    placements: [],
    campuses: { Autumn2028: "MNS" },
    sectionChoices: { Autumn2028: { "CSE 2221": ["12345"] } },
    simulationPreferences: {
      Autumn2028: {
        compact: true,
        buffer: 10,
        blocked: [{ days: [1], start: 600, end: 660 }],
      },
    },
  };
  plan.hiddenPrograms = ["CPTINF-BA"];
  const restored = await readPlanBackup(
    file({ ...plan, email: "private@example.com", databaseId: 123 }),
    signal(),
  );
  assert.deepEqual(restored, plan);
  assert.deepEqual(await readPlanBackup(file(restored), signal()), restored);
  assert.equal(serializePlan(restored), serializePlan(plan));
});
test("backup supports legacy versions and empty plans", async () => {
  assert.deepEqual(
    await readPlanBackup(file({ ...emptyPlan(), schemaVersion: 1 }), signal()),
    emptyPlan(),
  );
});
test("invalid, oversized and cancelled backups fail before replacing a plan", async () => {
  await assert.rejects(readPlanBackup(file({ schemaVersion: 99 }), signal()));
  await assert.rejects(
    readPlanBackup(
      {
        size: 5 * 1024 * 1024,
        text: async () => {
          throw Error("must not read");
        },
      },
      signal(),
    ),
    /backup-size/,
  );
  const controller = new AbortController();
  await assert.rejects(
    readPlanBackup(
      {
        size: 10,
        text: async () => {
          controller.abort();
          return serializePlan(emptyPlan());
        },
      },
      controller.signal,
    ),
  );
});

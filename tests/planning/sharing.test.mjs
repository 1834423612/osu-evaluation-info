import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("plan capabilities, owner revocation, expiry and quotas protect sanitized snapshots", async () => {
  process.env.USER_DATA_SCHEMA = "osu_plan_share_test";
  process.env.DATABASE_URL = "postgresql://synthetic.invalid/test";
  process.env.USER_DATA_SECRET = "synthetic-planning-test-secret-000000000000";
  const db = new PGlite();
  const query = async (sql, values) => {
    const r = await db.query(sql, values);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  global.osuEvaluationPool = {
    query,
    connect: async () => ({ query, release() {} }),
  };
  const { domainSQL } = await import("../../src/lib/user-data/namespace.ts");
  try {
    for (const file of [
      "20261114_user_data_base.sql",
      "20261123_planning_shares.sql",
    ])
      await db.exec(
        domainSQL(
          await readFile(
            new URL("../../db/migrations/" + file, import.meta.url),
            "utf8",
          ),
        ),
      );
    const {
      publishPlanningShare,
      readPlanningShare,
      listPlanningShares,
      revokePlanningShare,
    } = await import("../../src/lib/planning/sharing.ts");
    const snapshot = {
      version: 1,
      title: "Spring options",
      ownerId: "private-account",
      documents: ["secret report"],
      semesters: [
        {
          term: "Spring2027",
          campus: "MNS",
          courses: [
            {
              subject: "PSYCH",
              number: "1100",
              credits: 3,
              status: "completed",
              grade: "A",
            },
          ],
        },
      ],
    };
    const link = await publishPlanningShare("a", {
      snapshot,
      expiresIn: 604800,
    });
    assert.equal(link.capability.length, 43);
    const shared = await readPlanningShare({
      id: link.id,
      capability: link.capability,
    });
    assert.deepEqual(Object.keys(shared).sort(), ["expiresAt", "snapshot"]);
    assert.doesNotMatch(
      JSON.stringify(shared),
      /secret|ownerId|completed|grade/,
    );
    await assert.rejects(
      readPlanningShare({ id: link.id, capability: "x".repeat(43) }),
      /unavailable/,
    );
    assert.equal((await listPlanningShares("b")).length, 0);
    await revokePlanningShare("b", link.id);
    assert.equal(
      (await readPlanningShare({ id: link.id, capability: link.capability }))
        .snapshot.title,
      "Spring options",
    );
    await revokePlanningShare("a", link.id);
    await assert.rejects(
      readPlanningShare({ id: link.id, capability: link.capability }),
      /unavailable/,
    );
    const expired = await publishPlanningShare("a", {
      snapshot,
      expiresIn: 86400,
    });
    await query(
      "UPDATE osu_plan_share_test.planning_share SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    await assert.rejects(
      readPlanningShare({ id: expired.id, capability: expired.capability }),
      /unavailable/,
    );
    for (let i = 0; i < 20; i++)
      await publishPlanningShare("a", { snapshot, expiresIn: 0 });
    await assert.rejects(
      publishPlanningShare("a", { snapshot, expiresIn: 0 }),
      /share_capacity/,
    );
  } finally {
    await db.close();
    delete global.osuEvaluationPool;
  }
});

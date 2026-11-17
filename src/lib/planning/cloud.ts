import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { UserDataError } from "../user-data/http.ts";
import { checkBudget } from "../user-data/rate-limit.ts";
import { planSchema } from "./model.ts";
import { genericRequirementTemplates } from "./generic-template.ts";

type Query = Pick<PoolClient, "query">;
export async function readPlanningBackup(
  accountId: string,
  db: Query = getDatabasePool(),
) {
  const row = (
    await db.query(
      "SELECT version,plan,updated_at FROM " +
        table("planning_backup") +
        " WHERE account_id=$1",
      [accountId],
    )
  ).rows[0];
  return {
    accountId,
    version: Number(row?.version ?? 0),
    plan: row?.plan ? planSchema.parse(row.plan) : null,
    updatedAt: row?.updated_at ?? null,
  };
}

/** Row lock serializes competing devices. Retrying the same payload is idempotent. */
export async function writePlanningBackup(
  accountId: string,
  base: number,
  input: unknown | null,
) {
  await checkBudget("planning-backup", accountId, 60, 30);
  const plan = input === null ? null : planSchema.parse(input);
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "INSERT INTO " +
        table("planning_backup") +
        "(account_id) VALUES($1) ON CONFLICT DO NOTHING",
      [accountId],
    );
    await db.query(
      "SELECT account_id FROM " +
        table("planning_backup") +
        " WHERE account_id=$1 FOR UPDATE",
      [accountId],
    );
    const current = await readPlanningBackup(accountId, db);
    const same = JSON.stringify(current.plan) === JSON.stringify(plan);
    if (current.version !== base && !same)
      throw new UserDataError("planning_conflict", 409);
    if (!same)
      await db.query(
        "UPDATE " +
          table("planning_backup") +
          " SET plan=$2::jsonb,version=version+1,updated_at=now() WHERE account_id=$1",
        [accountId, plan === null ? null : JSON.stringify(plan)],
      );
    const result = await readPlanningBackup(accountId, db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

export async function saveRequirementTemplates(
  accountId: string,
  input: unknown,
) {
  await checkBudget("planning-template", accountId, 3600, 20);
  const templates = genericRequirementTemplates(input);
  const db = await getDatabasePool().connect();
  let stored = 0;
  try {
    await db.query("BEGIN");
    for (const template of templates) {
      const encoded = JSON.stringify(template);
      const digest = createHash("sha256").update(encoded).digest("hex");
      const result = await db.query(
        "INSERT INTO " +
          table("requirement_template") +
          "(digest,program_code,applied_version,catalog_term,tree) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING",
        [
          digest,
          template.programCode,
          template.appliedVersion,
          template.catalogTerm,
          encoded,
        ],
      );
      stored += result.rowCount ?? 0;
    }
    await db.query("COMMIT");
    return { submitted: templates.length, stored };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

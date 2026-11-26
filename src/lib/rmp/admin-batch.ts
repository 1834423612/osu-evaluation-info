import {
  courseDecisionBatchInput,
  type BatchDecisionItem,
} from "./admin-input.ts";
import { rmpRecordFingerprint } from "./admin-fingerprint.ts";
import {
  adminRowsSQL,
  adminRowFields,
  adminSourceFingerprint,
} from "./admin-queries.ts";
import {
  writeCourseDecision,
  RmpDecisionError,
  type AdminQuery,
} from "./admin-store.ts";
import type { RmpAdminRow } from "./admin-types.ts";
import { lookupOfficialCourseMetadata } from "./official-courses.ts";
export type BatchConnection = { query: AdminQuery };
export type BatchIssue = {
  professorId: string;
  campus: string;
  token: string;
  code: string;
  actualVersion?: number;
};
export class RmpBatchError extends RmpDecisionError {
  issues: BatchIssue[];
  constructor(code: "batch_conflict" | "batch_invalid", issues: BatchIssue[]) {
    super(code);
    this.issues = issues;
  }
}
export function rmpDecisionKey(row: {
  professorId: string;
  campus: string;
  token: string;
}) {
  return JSON.stringify([row.professorId, row.campus, row.token]);
}
export async function currentRmpAdminRows(
  query: AdminQuery,
  items: { professorId: string; campus: string; token: string }[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const requested = items.map((item) => ({
    professor_id: item.professorId,
    campus_code: item.campus,
    raw_course_token: item.token,
  }));
  const result = await query(
    `${adminRowsSQL(env)}, requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(professor_id bigint,campus_code text,raw_course_token text))
    SELECT ${adminRowFields},${adminSourceFingerprint("rows")} AS "sourceFingerprint",
      (SELECT count(*)::int FROM osu_rmp.review rv WHERE rv.professor_id=rows.professor_id AND rv.active AND osu_rmp.review_course_token(rv.class_name)=rows.raw_course_token) AS "reviewCount",
      EXISTS(SELECT 1 FROM osu_rmp.course_identity_match m WHERE m.professor_id=rows.professor_id AND m.campus_code=rows.campus_code AND m.raw_course_token=rows.raw_course_token) AS "sourcePresent"
    FROM rows JOIN requested USING(professor_id,campus_code,raw_course_token) ORDER BY professor_id,campus_code,raw_course_token`,
    [JSON.stringify(requested)],
  );
  return result.rows as unknown as (RmpAdminRow & { sourcePresent: boolean })[];
}
type Applied = {
  professorId: string;
  campus: string;
  token: string;
  version: number;
};
export async function applyRmpDecisionBatch(
  db: BatchConnection,
  raw: unknown,
  actor: string,
  options: {
    env?: NodeJS.ProcessEnv;
    beforeApply?: (
      query: AdminQuery,
      items: BatchDecisionItem[],
    ) => Promise<void>;
    afterApply?: (query: AdminQuery, items: Applied[]) => Promise<void>;
  } = {},
) {
  const input = courseDecisionBatchInput.parse(raw),
    query = db.query.bind(db),
    env = options.env ?? process.env;
  if (input.proposalId && (!options.beforeApply || !options.afterApply))
    throw new RmpBatchError("batch_invalid", [
      { ...input.items[0], code: "proposal_approval_required" },
    ]);
  await query("BEGIN", []);
  try {
    await query("SET LOCAL lock_timeout='3s'", []);
    await query("SELECT pg_advisory_xact_lock(7241102917::bigint)", []);
    const rows = await currentRmpAdminRows(query, input.items, env),
      byKey = new Map(rows.map((row) => [rmpDecisionKey(row), row]));
    const issues: BatchIssue[] = [];
    for (const item of input.items) {
      const row = byKey.get(rmpDecisionKey(item));
      if (!row?.sourcePresent)
        issues.push({
          professorId: item.professorId,
          campus: item.campus,
          token: item.token,
          code: "unknown_label",
        });
      else if (row.version !== item.expectedVersion)
        issues.push({
          professorId: item.professorId,
          campus: item.campus,
          token: item.token,
          code: "version_conflict",
          actualVersion: row.version,
        });
      else if (rmpRecordFingerprint(row) !== item.recordFingerprint)
        issues.push({
          professorId: item.professorId,
          campus: item.campus,
          token: item.token,
          code: "evidence_changed",
          actualVersion: row.version,
        });
    }
    if (issues.length)
      throw new RmpBatchError(
        issues.some((item) => item.code !== "unknown_label")
          ? "batch_conflict"
          : "batch_invalid",
        issues,
      );
    const targets = input.items.filter((item) => item.action === "bind");
    if (targets.length) {
      const valid = await lookupOfficialCourseMetadata(
        query,
        targets.map((item) => ({ campus: item.campus, key: item.courseKey! })),
      );
      const keys = new Set(
        valid.map((row) => JSON.stringify([row.campus, row.key])),
      );
      for (const item of targets)
        if (!keys.has(JSON.stringify([item.campus, item.courseKey])))
          issues.push({
            professorId: item.professorId,
            campus: item.campus,
            token: item.token,
            code: "unknown_official_course",
          });
      if (issues.length) throw new RmpBatchError("batch_invalid", issues);
    }
    await options.beforeApply?.(query, input.items);
    const applied: Applied[] = [];
    for (const item of input.items) {
      try {
        const result = await writeCourseDecision(query, item, actor, env, {
          proposalId: input.proposalId,
        });
        applied.push({
          professorId: item.professorId,
          campus: item.campus,
          token: item.token,
          version: result.version,
        });
      } catch (error) {
        if (error instanceof RmpDecisionError && error.code === "conflict")
          throw new RmpBatchError("batch_conflict", [
            {
              professorId: item.professorId,
              campus: item.campus,
              token: item.token,
              code: "version_conflict",
            },
          ]);
        throw error;
      }
    }
    await options.afterApply?.(query, applied);
    await query("COMMIT", []);
    return { items: applied };
  } catch (error) {
    await query("ROLLBACK", []);
    throw error;
  }
}

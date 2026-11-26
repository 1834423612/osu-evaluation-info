import { rmpAdminTable } from "./admin-namespace.ts";
import {
  courseDecisionInput,
  type CourseDecisionInput,
} from "./admin-input.ts";
export class RmpDecisionError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export type AdminQuery = (
  sql: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
/** One compare-and-swap statement; the trigger commits the audit atomically. */
export async function writeCourseDecision(
  query: AdminQuery,
  raw: CourseDecisionInput,
  actor: string,
  env: NodeJS.ProcessEnv = process.env,
  provenance: { proposalId?: string } = {},
) {
  const input = courseDecisionInput.parse(raw),
    table = rmpAdminTable("course_decision", env);
  const values = [
    input.professorId,
    input.campus,
    input.token,
    input.action,
    input.courseKey,
    input.reason,
    JSON.stringify(input.evidenceUrls),
    actor,
    provenance.proposalId ?? null,
    input.expectedVersion,
  ];
  const result = await query(
    input.expectedVersion === 0
      ? `INSERT INTO ${table}
    (professor_id,campus_code,raw_course_token,action,course_key,reason,evidence_urls,decided_by,proposal_id)
    VALUES($1::bigint,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
    ON CONFLICT(professor_id,campus_code,raw_course_token) DO NOTHING RETURNING version`
      : `UPDATE ${table}
    SET action=$4,course_key=$5,reason=$6,evidence_urls=$7::jsonb,decided_by=$8,proposal_id=$9,version=version+1,updated_at=now()
    WHERE professor_id=$1::bigint AND campus_code=$2 AND raw_course_token=$3 AND version=$10 RETURNING version`,
    input.expectedVersion === 0 ? values.slice(0, 9) : values,
  );
  if (!result.rows.length) throw new RmpDecisionError("conflict");
  return { version: Number(result.rows[0].version) };
}

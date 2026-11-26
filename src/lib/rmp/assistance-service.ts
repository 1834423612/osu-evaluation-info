import { getDatabasePool } from "../db.ts";
import { rmpAdminDetail } from "./admin-service.ts";
import { currentRmpAdminRows } from "./admin-batch.ts";
import {
  lookupOfficialCourseMetadata,
  type OfficialCourseMetadata,
} from "./official-courses.ts";
import { buildPublicAssistanceGroup } from "./assistance-evidence.ts";
import { assistanceKey, type AssistanceGroup } from "./assistance-types.ts";
import { AssistanceError } from "./assistance-store.ts";
import type { RmpAdminRow, RmpAdminDetail } from "./admin-types.ts";

type Identity = { professorId: string; campus: string; token: string };
type Target = { campus: string; key: string };
type Dependencies = {
  loadRows: (identities: Identity[]) => Promise<RmpAdminRow[]>;
  loadDetail: (identity: Identity) => Promise<RmpAdminDetail | null>;
  lookupTargets: (targets: Target[]) => Promise<OfficialCourseMetadata[]>;
};
const targetKey = ({ campus, key }: Target) => `${campus}:${key}`;

export async function collectAssistanceEvidence(
  input: Identity[],
  dependencies: Dependencies,
): Promise<AssistanceGroup[]> {
  if (new Set(input.map(assistanceKey)).size !== input.length)
    throw new AssistanceError("invalid");
  const rows = await dependencies.loadRows(input);
  if (rows.length !== input.length) throw new AssistanceError("missing");
  const details: {
    row: RmpAdminRow;
    detail: RmpAdminDetail;
    keys: string[];
  }[] = new Array(rows.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, rows.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= rows.length) return;
        const detail = await dependencies.loadDetail(rows[index]);
        if (!detail) throw new AssistanceError("missing");
        const row = detail.row;
        const keys = [
          ...new Set([
            ...row.candidates,
            ...detail.teaching.map((item) => item.course_key),
            ...(row.courseKey ? [row.courseKey] : []),
          ]),
        ]
          .filter((key) =>
            /^[A-Z]{2,20}\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/.test(key),
          )
          .slice(0, 50);
        details[index] = { row, detail, keys };
      }
    }),
  );
  const targets = [
    ...new Map(
      details.flatMap(({ row, keys }) =>
        keys.map((key) => {
          const target = { campus: row.campus, key };
          return [targetKey(target), target] as const;
        }),
      ),
    ).values(),
  ];
  // Resolve the whole export in one indexed official-facts lookup. A course's
  // presence at a different campus must not enter this group's candidates.
  const official = targets.length
    ? await dependencies.lookupTargets(targets)
    : [];
  const metadata = new Map<string, AssistanceGroup["candidates"]>();
  for (const item of official) {
    const key = targetKey(item),
      items = metadata.get(key) ?? [];
    if (
      !items.some(
        (candidate) =>
          candidate.title === item.title &&
          candidate.source === item.source &&
          candidate.term === item.term,
      )
    )
      items.push({
        key: item.key,
        title: item.title,
        source: item.source,
        term: item.term,
      });
    metadata.set(key, items);
  }
  return details.map(({ row, detail, keys }) =>
    buildPublicAssistanceGroup(
      row,
      detail,
      keys.flatMap(
        (key) => metadata.get(targetKey({ campus: row.campus, key })) ?? [],
      ),
    ),
  );
}

export async function buildAssistanceEvidence(
  input: Identity[],
): Promise<AssistanceGroup[]> {
  const pool = getDatabasePool(),
    query = (sql: string, values?: unknown[]) => pool.query(sql, values);
  return collectAssistanceEvidence(input, {
    loadRows: (identities) => currentRmpAdminRows(query, identities),
    loadDetail: ({ professorId, campus, token }) =>
      rmpAdminDetail(professorId, campus, token),
    lookupTargets: (targets) => lookupOfficialCourseMetadata(query, targets),
  });
}

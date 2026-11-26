import { createHash } from "node:crypto";
import type { RmpAdminRow } from "./admin-types.ts";
export function stableRmpJson(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value))
    return "[" + value.map(stableRmpJson).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => JSON.stringify(key) + ":" + stableRmpJson(item))
      .join(",") +
    "}"
  );
}
export function rmpSnapshotHash(value: unknown) {
  return createHash("sha256").update(stableRmpJson(value)).digest("hex");
}
export function rmpRecordFingerprint(
  row: RmpAdminRow & { sourceFingerprint?: string | null },
) {
  return rmpSnapshotHash({
    professorId: row.professorId,
    campus: row.campus,
    token: row.token,
    candidates: row.candidates,
    evidence: row.evidence,
    version: row.version,
    reviewCount: row.reviewCount,
    sourceFingerprint: row.sourceFingerprint ?? null,
    state: row.state,
    courseKey: row.courseKey,
    updatedAt: row.updatedAt,
    identityState: row.identityState,
    username: row.username,
  });
}

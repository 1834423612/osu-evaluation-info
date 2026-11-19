import { emptyPlan, type Plan } from "./model.ts";
import type { SyncFeatures } from "../sync/features.ts";
/** Select enabled domains from local, preserving paused domains from the other side. */
export function projectSyncPlan(
  local: Plan | null,
  other: Plan | null,
  features: SyncFeatures,
): Plan | null {
  if (features.planning && features.calendars) return local;
  if (!features.planning && !features.calendars) return other;
  const source = features.planning ? local : other;
  const calendars = features.calendars
    ? local?.schedule.calendars
    : other?.schedule.calendars;
  if (!source && !calendars?.length) return null;
  const result = structuredClone(source ?? emptyPlan());
  if (calendars === undefined) delete result.schedule.calendars;
  else result.schedule.calendars = structuredClone(calendars);
  return result;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** Detect competing edits before reconciliation can choose a scalar value. */
export function planConflicts(
  base: unknown,
  local: unknown,
  remote: unknown,
  path = "plan",
): string[] {
  if (same(local, base) || same(remote, base) || same(local, remote)) return [];
  if (Array.isArray(local) && Array.isArray(remote)) {
    const keyed = (values: unknown[]) => {
      const result = new Map<string, unknown>();
      for (const v of values) {
        if (!v || typeof v !== "object") {
          result.set(JSON.stringify(v), v);
          continue;
        }
        const row = v as Record<string, unknown>;
        const key = path.endsWith("semesters")
          ? JSON.stringify([row.documentId, row.term, row.creditOrigin])
          : path.endsWith("allocations")
            ? `${row.courseId}|${row.requirementId}`
            : String(row.id ?? row.courseId ?? JSON.stringify(v));
        const previous = result.get(key) as Record<string, unknown> | undefined;
        result.set(
          key,
          path.endsWith("semesters") && previous
            ? {
                ...row,
                courses: [
                  ...(previous.courses as unknown[]),
                  ...(row.courses as unknown[]),
                ],
              }
            : v,
        );
      }
      return result;
    };
    const left = keyed(local),
      right = keyed(remote),
      before = keyed(Array.isArray(base) ? base : []);
    return [...new Set([...left.keys(), ...right.keys()])].flatMap((key) =>
      planConflicts(
        before.get(key),
        left.get(key),
        right.get(key),
        path + "[]",
      ),
    );
  }
  if (
    local &&
    remote &&
    typeof local === "object" &&
    typeof remote === "object"
  ) {
    const left = local as Record<string, unknown>,
      right = remote as Record<string, unknown>,
      before = (base ?? {}) as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(
      (key) =>
        key === "updatedAt"
          ? []
          : planConflicts(before[key], left[key], right[key], path + "." + key),
    );
  }
  return [path];
}

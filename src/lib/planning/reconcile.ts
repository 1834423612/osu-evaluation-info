import { emptyPlan, planSchema, type Plan } from "./model.ts";
import { mergeSnapshots } from "./snapshots.ts";
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function identity(value: unknown, field: string) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const row = value as Record<string, unknown>;
  if (field === "semesters")
    return JSON.stringify([row.documentId, row.term, row.creditOrigin]);
  if (field === "allocations") return `${row.courseId}|${row.requirementId}`;
  return String(row.id ?? row.courseId ?? JSON.stringify(value));
}
function merge(
  base: unknown,
  local: unknown,
  remote: unknown,
  field = "",
): unknown {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  if (Array.isArray(local) && Array.isArray(remote)) {
    const index = (values: unknown[]) => {
      const result = new Map<string, unknown>();
      for (const value of values) {
        const key = identity(value, field);
        const previous = result.get(key);
        if (field === "semesters" && previous) {
          const before = previous as Plan["semesters"][number];
          const current = value as Plan["semesters"][number];
          result.set(key, {
            ...current,
            courses: [...before.courses, ...current.courses],
          });
        } else result.set(key, value);
      }
      return result;
    };
    const before = index(Array.isArray(base) ? base : []),
      left = index(local),
      right = index(remote);
    return [...new Set([...left.keys(), ...right.keys()])].flatMap((key) => {
      const value = merge(
        before.get(key),
        left.get(key),
        right.get(key),
        field,
      );
      return value === undefined ? [] : [value];
    });
  }
  if (
    local &&
    remote &&
    typeof local === "object" &&
    typeof remote === "object"
  ) {
    const before = (base ?? {}) as Record<string, unknown>,
      left = local as Record<string, unknown>,
      right = remote as Record<string, unknown>;
    return Object.fromEntries(
      [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(
        (key) => {
          const value = merge(before[key], left[key], right[key], key);
          return value === undefined ? [] : [[key, value]];
        },
      ),
    );
  }
  if (
    field === "refreshedAt" &&
    typeof local === "string" &&
    typeof remote === "string" &&
    Number.isFinite(Date.parse(local)) &&
    Number.isFinite(Date.parse(remote))
  )
    return Date.parse(local) >= Date.parse(remote) ? local : remote;
  // The local edit being submitted wins a concurrent edit to the same scalar.
  return local;
}
export function reconcilePlans(
  base: Plan | null,
  local: Plan | null,
  remote: Plan | null,
): Plan | null {
  // Before the first shared version, imported IDs belong to separate devices.
  // Preserve both reports by remapping identities instead of combining their fields.
  if (
    !base &&
    local?.documents.length &&
    remote?.documents.length &&
    !same(local, remote)
  ) {
    return mergeSnapshots(local, remote);
  }
  const value = merge(base, local, remote) as Plan | null;
  if (!value) return null;
  const result = { ...emptyPlan(), ...value };
  const documents = new Set(result.documents.map((d) => d.id));
  result.programs = result.programs.filter((p) => documents.has(p.documentId));
  const programs = new Set(result.programs.map((p) => p.id));
  result.semesters = result.semesters
    .filter((s) => !s.documentId || documents.has(s.documentId))
    .flatMap((semester) => {
      // Reconciliation combines matching containers, then respects the schema's row budget.
      if (semester.courses.length <= 100) return [semester];
      const chunks = [];
      for (let offset = 0; offset < semester.courses.length; offset += 100)
        chunks.push({
          ...semester,
          courses: semester.courses.slice(offset, offset + 100),
        });
      return chunks;
    });
  result.requirements = result.requirements.filter((r) =>
    programs.has(r.programId),
  );
  let ids = new Set(result.requirements.map((r) => r.id));
  while (result.requirements.some((r) => r.parentId && !ids.has(r.parentId))) {
    result.requirements = result.requirements.filter(
      (r) => !r.parentId || ids.has(r.parentId),
    );
    ids = new Set(result.requirements.map((r) => r.id));
  }
  const courses = new Set(
    result.semesters.flatMap((s) => s.courses.map((c) => c.id)),
  );
  result.allocations = result.allocations.filter(
    (a) => courses.has(a.courseId) && ids.has(a.requirementId),
  );
  result.schedule = {
    ...result.schedule,
    placements: result.schedule.placements.filter((p) =>
      courses.has(p.courseId),
    ),
    groups: result.schedule.groups
      ?.filter((g) => !g.requirementId || ids.has(g.requirementId))
      .map((g) => ({
        ...g,
        courseIds: g.courseIds.filter((id) => courses.has(id)),
        selectedCourseId:
          g.selectedCourseId && courses.has(g.selectedCourseId)
            ? g.selectedCourseId
            : null,
      })),
  };
  result.schedule.terms = [
    ...new Set([
      ...result.schedule.terms,
      ...result.schedule.placements.flatMap((p) =>
        p.term ? [p.term.replace(/ /g, "")] : [],
      ),
    ]),
  ];
  return planSchema.parse(result);
}

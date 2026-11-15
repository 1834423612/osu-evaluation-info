import { planSchema, type Plan } from "./model.ts";
/** Keep every source observation. Matching course codes never imply matching requirements. */
export function mergeSnapshots(current: Plan, incoming: Plan): Plan {
  const left = planSchema.parse(current),
    right = planSchema.parse(incoming);
  let ordinal = 1;
  while (left.documents.some((d) => d.id.startsWith(`import-${ordinal}-`)))
    ordinal++;
  const prefix = `import-${ordinal}-`;
  const id = (value: string) => prefix + value;
  const merged = {
    ...left,
    reviewed: false,
    appliedVersion:
      left.appliedVersion === right.appliedVersion ? left.appliedVersion : null,
    catalogTerm:
      left.catalogTerm === right.catalogTerm ? left.catalogTerm : null,
    auditMode: left.auditMode === right.auditMode ? left.auditMode : "unknown",
    documents: [
      ...left.documents,
      ...right.documents.map((d) => ({ ...d, id: id(d.id) })),
    ],
    programs: [
      ...left.programs,
      ...right.programs.map((p) => ({
        ...p,
        id: id(p.id),
        documentId: id(p.documentId),
      })),
    ],
    requirements: [
      ...left.requirements,
      ...right.requirements.map((r) => ({
        ...r,
        id: id(r.id),
        documentId: id(r.documentId),
        programId: id(r.programId),
        parentId: r.parentId ? id(r.parentId) : null,
      })),
    ],
    semesters: [
      ...left.semesters,
      ...right.semesters.map((s) => ({
        ...s,
        documentId: s.documentId ? id(s.documentId) : undefined,
        courses: s.courses.map((c) => ({
          ...c,
          id: c.id ? id(c.id) : undefined,
          documentId: c.documentId ? id(c.documentId) : undefined,
        })),
      })),
    ],
    allocations: [
      ...left.allocations,
      ...right.allocations.map((a) => ({
        ...a,
        courseId: id(a.courseId),
        requirementId: id(a.requirementId),
      })),
    ],
  };
  return planSchema.parse(merged);
}
export function removeSnapshot(plan: Plan, documentId: string): Plan {
  const removedCourses = new Set(
    plan.semesters
      .filter((s) => s.documentId === documentId)
      .flatMap((s) => s.courses.map((c) => c.id)),
  );
  const removedRequirements = new Set(
    plan.requirements
      .filter((r) => r.documentId === documentId)
      .map((r) => r.id),
  );
  return planSchema.parse({
    ...plan,
    reviewed: false,
    documents: plan.documents.filter((d) => d.id !== documentId),
    programs: plan.programs.filter((p) => p.documentId !== documentId),
    requirements: plan.requirements.filter((r) => r.documentId !== documentId),
    semesters: plan.semesters.filter((s) => s.documentId !== documentId),
    allocations: plan.allocations.filter(
      (a) =>
        !removedCourses.has(a.courseId) &&
        !removedRequirements.has(a.requirementId),
    ),
  });
}
/** Per-node observation only; never a degree-total or cross-program remaining-credit sum. */
export function requirementProgress(
  plan: Plan,
  requirementId: string,
  visited = new Set<string>(),
): {
  state: "satisfied" | "insufficient" | "unresolved";
  knownCredits: number;
  distinctCourses: number;
} {
  if (visited.has(requirementId))
    return { state: "unresolved", knownCredits: 0, distinctCourses: 0 };
  visited = new Set([...visited, requirementId]);
  const node = plan.requirements.find((r) => r.id === requirementId);
  const ancestors = new Set([requirementId]);
  let ancestor = node?.parentId;
  while (ancestor) {
    if (ancestors.has(ancestor))
      return { state: "unresolved", knownCredits: 0, distinctCourses: 0 };
    ancestors.add(ancestor);
    ancestor = plan.requirements.find((r) => r.id === ancestor)?.parentId;
  }
  if (!node)
    return {
      state: "unresolved",
      knownCredits: 0,
      distinctCourses: 0,
    } as const;
  const confirmed = new Set(
    plan.allocations
      .filter((a) => a.confirmed && a.requirementId === requirementId)
      .map((a) => a.courseId),
  );
  const facts = new Map<string, Set<number | null>>();
  for (const course of plan.semesters.flatMap((s) => s.courses)) {
    if (
      !course.id ||
      !confirmed.has(course.id) ||
      course.kind === "placeholder" ||
      !course.subject ||
      !course.number
    )
      continue;
    const key = course.subject + " " + course.number;
    const values = facts.get(key) ?? new Set();
    values.add(course.credits);
    facts.set(key, values);
  }
  let knownCredits = 0,
    unknown = false;
  for (const values of facts.values()) {
    if (values.size !== 1 || values.has(null)) unknown = true;
    else knownCredits += [...values][0]!;
  }
  const children = plan.requirements.filter(
    (r) => r.parentId === requirementId,
  );
  let state: "satisfied" | "insufficient" | "unresolved" = "unresolved";
  if (node.kind === "credits" && node.minimumCredits !== null)
    state = unknown
      ? "unresolved"
      : knownCredits >= node.minimumCredits
        ? "satisfied"
        : "insufficient";
  if (node.kind === "courses" && node.minimumCourses !== null)
    state = facts.size >= node.minimumCourses ? "satisfied" : "insufficient";
  if ((node.kind === "all" || node.kind === "any") && children.length) {
    const states = children.map(
      (c) => requirementProgress(plan, c.id, visited).state,
    );
    state =
      node.kind === "all"
        ? states.every((s) => s === "satisfied")
          ? "satisfied"
          : states.includes("unresolved")
            ? "unresolved"
            : "insufficient"
        : states.includes("satisfied")
          ? "satisfied"
          : states.includes("unresolved")
            ? "unresolved"
            : "insufficient";
  }
  return { state, knownCredits, distinctCourses: facts.size };
}
export function pruneAllocations(plan: Plan): Plan {
  const courses = new Set(
    plan.semesters.flatMap((s) => s.courses.map((c) => c.id)),
  );
  const requirements = new Set(plan.requirements.map((r) => r.id));
  return {
    ...plan,
    allocations: plan.allocations.filter(
      (a) => courses.has(a.courseId) && requirements.has(a.requirementId),
    ),
  };
}
export function removeRequirement(plan: Plan, id: string): Plan {
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of plan.requirements)
      if (r.parentId && removed.has(r.parentId) && !removed.has(r.id)) {
        removed.add(r.id);
        changed = true;
      }
  }
  return pruneAllocations({
    ...plan,
    reviewed: false,
    requirements: plan.requirements.filter((r) => !removed.has(r.id)),
  });
}

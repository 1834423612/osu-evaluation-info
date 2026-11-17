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
    hiddenPrograms: [...new Set([...(left.hiddenPrograms ?? []), ...(right.hiddenPrograms ?? [])])],
    schedule: {
      groups:[...left.schedule.groups ?? [],...(right.schedule.groups ?? []).map((g)=>({...g,id:id(g.id),requirementId:g.requirementId?id(g.requirementId):undefined,courseIds:g.courseIds.map(id),selectedCourseId:g.selectedCourseId?id(g.selectedCourseId):g.selectedCourseId,credits:g.credits?Object.fromEntries(Object.entries(g.credits).map(([key,value])=>[id(key),value])):undefined}))],
      sectionChoices: { ...right.schedule.sectionChoices, ...left.schedule.sectionChoices },
      simulationPreferences: { ...right.schedule.simulationPreferences, ...left.schedule.simulationPreferences },
      campuses: { ...right.schedule.campuses, ...left.schedule.campuses },
      terms: [...new Set([...left.schedule.terms, ...right.schedule.terms])],
      placements: [
        ...left.schedule.placements,
        ...right.schedule.placements.map((p) => ({
          ...p,
          courseId: id(p.courseId),
        })),
      ],
    },
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
    schedule: {
      ...plan.schedule,
      groups:plan.schedule.groups?.filter((g)=>!g.requirementId||!removedRequirements.has(g.requirementId)).map((g)=>({...g,courseIds:g.courseIds.filter((id)=>!removedCourses.has(id)),selectedCourseId:g.selectedCourseId&&!removedCourses.has(g.selectedCourseId)?g.selectedCourseId:null})),
      placements: plan.schedule.placements.filter((p) => !removedCourses.has(p.courseId)),
    },
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
  state: "satisfied" | "planned" | "insufficient" | "unresolved";
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
  if (node?.reportedStatus)
    return {
      state:
        node.reportedStatus === "completed"
          ? "satisfied"
          : node.reportedStatus === "remaining"
            ? "insufficient"
            : "planned",
      knownCredits: 0,
      distinctCourses: 0,
    };
  if (!node || node.hierarchyReviewed !== true)
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
  const facts = new Map<
    string,
    { credits: Set<number | null>; statuses: Set<string> }
  >();
  const invalidObservation = plan.semesters
    .flatMap((s) => s.courses)
    .some(
      (c) =>
        c.id &&
        confirmed.has(c.id) &&
        (c.evidenceRole !== "observation" ||
          c.kind === "placeholder" ||
          !c.subject ||
          !c.number),
    );
  for (const course of plan.semesters.flatMap((s) => s.courses)) {
    if (
      !course.id ||
      !confirmed.has(course.id) ||
      course.kind === "placeholder" ||
      course.evidenceRole !== "observation" ||
      !course.subject ||
      !course.number
    )
      continue;
    const key = course.subject + " " + course.number;
    const values = facts.get(key) ?? {
      credits: new Set<number | null>(),
      statuses: new Set<string>(),
    };
    values.credits.add(course.credits);
    values.statuses.add(course.status);
    facts.set(key, values);
  }
  let knownCredits = 0,
    completedCredits = 0,
    completedCourses = 0,
    unknown = invalidObservation,
    unknownStatus = false;
  for (const values of facts.values()) {
    const complete =
      values.statuses.size === 1 && values.statuses.has("completed");
    if (complete) completedCourses++;
    if (values.statuses.size !== 1 || values.statuses.has("unknown"))
      unknownStatus = true;
    if (values.credits.size !== 1 || values.credits.has(null)) unknown = true;
    else {
      knownCredits += [...values.credits][0]!;
      if (complete) completedCredits += [...values.credits][0]!;
    }
  }
  const children = plan.requirements.filter(
    (r) => r.parentId === requirementId,
  );
  let state: "satisfied" | "planned" | "insufficient" | "unresolved" =
    "unresolved";
  if (node.kind === "credits" && node.minimumCredits !== null)
    state =
      completedCredits >= node.minimumCredits
        ? "satisfied"
        : knownCredits >= node.minimumCredits
          ? unknownStatus
            ? "unresolved"
            : "planned"
          : unknown
            ? "unresolved"
            : "insufficient";
  if (node.kind === "courses" && node.minimumCourses !== null)
    state =
      completedCourses >= node.minimumCourses
        ? "satisfied"
        : facts.size >= node.minimumCourses
          ? unknownStatus
            ? "unresolved"
            : "planned"
          : invalidObservation
            ? "unresolved"
            : "insufficient";
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
            : states.includes("insufficient")
              ? "insufficient"
              : "planned"
        : states.includes("satisfied")
          ? "satisfied"
          : states.includes("unresolved")
            ? "unresolved"
            : states.includes("planned")
              ? "planned"
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
    schedule: {
      ...plan.schedule,
      groups:plan.schedule.groups?.filter((g)=>!g.requirementId||requirements.has(g.requirementId)).map((g)=>({...g,courseIds:g.courseIds.filter((id)=>courses.has(id)),selectedCourseId:g.selectedCourseId&&courses.has(g.selectedCourseId)?g.selectedCourseId:null})),
      placements: plan.schedule.placements.filter((p) => courses.has(p.courseId)),
    },
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

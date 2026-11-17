import { planSchema, type Plan } from "./model.ts";
import {
  mergeSnapshots,
  removeSnapshot,
  pruneAllocations,
} from "./snapshots.ts";
function reportKey(plan: Plan, document: Plan["documents"][number]) {
  const versions = [
    ...new Set(
      plan.programs
        .filter((p) => p.documentId === document.id)
        .map((p) => p.appliedVersion)
        .filter(Boolean),
    ),
  ].sort();
  return [document.source, document.auditMode, ...versions].join("|");
}
function ruleKey(plan: Plan, rule: Plan["requirements"][number]) {
  const program = plan.programs.find((p) => p.id === rule.programId);
  const path: string[] = [];
  let node: typeof rule | undefined = rule;
  const seen = new Set<string>();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.unshift(
      node.title ??
        node.alternatives
          .map((c) => `${c.subject} ${c.number}`)
          .sort()
          .join("/"),
    );
    node = plan.requirements.find((r) => r.id === node?.parentId);
  }
  return [program?.code ?? program?.title, program?.appliedVersion, ...path]
    .join("|")
    .toLowerCase();
}
/** Fresh reports replace the same report type/version. Local placements and choices follow matching academic identities. */
export function replaceImportedReports(current: Plan, incoming: Plan) {
  const keys = new Set(
    incoming.documents
      .filter((d) => d.source !== "manual")
      .map((d) => reportKey(incoming, d)),
  );
  const replaced = current.documents.filter((d) =>
    keys.has(reportKey(current, d)),
  );
  if (!replaced.length) return mergeSnapshots(current, incoming);
  let retained = current;
  for (const document of replaced)
    retained = removeSnapshot(retained, document.id);
  const next = mergeSnapshots(retained, incoming);
  const newCourses = next.semesters.flatMap((s) =>
    s.courses.map((c) => ({ c, term: c.term ?? s.term })),
  );
  const courseMap = new Map<string, string>();
  for (const s of current.semesters)
    for (const c of s.courses) {
      if (!c.id) continue;
      if (newCourses.some((row) => row.c.id === c.id)) {
        courseMap.set(c.id, c.id);
        continue;
      }
      const matches = newCourses.filter(
        (row) =>
          row.c.kind === c.kind &&
          row.c.subject === c.subject &&
          row.c.number === c.number &&
          (c.kind !== "placeholder" || row.c.title === c.title),
      );
      const match =
        matches.find((row) => row.term === (c.term ?? s.term)) ??
        (matches.length === 1 ? matches[0] : undefined);
      if (match?.c.id) courseMap.set(c.id, match.c.id);
    }
  const ruleMap = new Map<string, string>();
  for (const rule of current.requirements) {
    const match =
      next.requirements.find((r) => r.id === rule.id) ??
      next.requirements.find(
        (r) => ruleKey(next, r) === ruleKey(current, rule),
      );
    if (match) ruleMap.set(rule.id, match.id);
  }
  const placements = current.schedule.placements.flatMap((p) => {
    const id = courseMap.get(p.courseId);
    return id ? [{ ...p, courseId: id }] : [];
  });
  next.schedule.placements = [
    ...new Map(
      [...next.schedule.placements, ...placements].map((p) => [p.courseId, p]),
    ).values(),
  ];
  const groups = (current.schedule.groups ?? []).flatMap((g) => {
    const requirementId = g.requirementId
      ? ruleMap.get(g.requirementId)
      : undefined;
    if (g.requirementId && !requirementId) return [];
    return [
      {
        ...g,
        requirementId,
        courseIds: g.courseIds.flatMap((id) =>
          courseMap.get(id) ? [courseMap.get(id)!] : [],
        ),
        selectedCourseId: g.selectedCourseId
          ? (courseMap.get(g.selectedCourseId) ?? null)
          : null,
        credits: g.credits
          ? Object.fromEntries(
              Object.entries(g.credits).flatMap(([id, value]) =>
                courseMap.get(id) ? [[courseMap.get(id)!, value]] : [],
              ),
            )
          : undefined,
      },
    ];
  });
  next.schedule.groups = [
    ...new Map(
      [...(next.schedule.groups ?? []), ...groups].map((g) => [g.id, g]),
    ).values(),
  ];
  const allocations = current.allocations.flatMap((a) => {
    const courseId = courseMap.get(a.courseId),
      requirementId = ruleMap.get(a.requirementId);
    return courseId && requirementId ? [{ ...a, courseId, requirementId }] : [];
  });
  next.allocations = [
    ...new Map(
      [...next.allocations, ...allocations].map((a) => [
        a.courseId + "|" + a.requirementId,
        a,
      ]),
    ).values(),
  ];
  return planSchema.parse(pruneAllocations(next));
}

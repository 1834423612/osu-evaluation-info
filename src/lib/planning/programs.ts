import type { Plan } from "./model.ts";
type Program = Plan["programs"][number];
export function programKey(plan: Plan, program: Program) {
  return [
    program.code ?? program.title ?? program.id,
    program.appliedVersion ?? "",
    plan.documents.find((d) => d.id === program.documentId)?.auditMode ??
      "unknown",
  ].join("|");
}
export function programRequirements(plan: Plan, programId: string) {
  const program = plan.programs.find((p) => p.id === programId);
  if (!program)
    return plan.requirements.filter((r) => r.programId === programId);
  const ids = new Set(
    plan.programs
      .filter((p) => programKey(plan, p) === programKey(plan, program))
      .map((p) => p.id),
  );
  return plan.requirements.filter((r) => ids.has(r.programId));
}
export function planningPrograms(plan: Plan) {
  const groups = new Map<string, Program>();
  const score = (program: Program) =>
    plan.requirements
      .filter((r) => r.programId === program.id)
      .reduce((n, r) => n + 1 + r.alternatives.length, 0);
  for (const program of plan.programs) {
    if (
      plan.hiddenPrograms?.includes(program.code ?? "") ||
      !plan.requirements.some((r) => r.programId === program.id)
    )
      continue;
    const key = programKey(plan, program),
      previous = groups.get(key);
    if (!previous || score(program) > score(previous)) groups.set(key, program);
  }
  return [...groups.values()];
}

export function requirementCodes(rule: Plan["requirements"][number]) {
  if (rule.alternatives.length) return rule.alternatives;
  const match =
    /^(?:Placeholder:\s*)?([A-Z][A-Z&]{1,11})\s+(\d{4}(?:\.\d{1,2})?[A-Z]?)(?:\s+or\s+(\d{4}(?:\.\d{1,2})?[A-Z]?))?\b/.exec(
      rule.title ?? "",
    );
  return match
    ? [match[2], match[3]]
        .filter(Boolean)
        .map((number) => ({ subject: match[1], number }))
    : [];
}

import { planSchema } from "./model.ts";

/** Copy academic requirements only. A template has no student progress or course attempts. */
export function genericRequirementTemplates(input: unknown) {
  const plan = planSchema.parse(input);
  return plan.programs
    .filter((program) => program.code)
    .flatMap((program) => {
      const programRules = plan.requirements.filter(
        (rule) => rule.programId === program.id,
      );
      const byId = new Map(programRules.map((rule) => [rule.id, rule]));
      const requirements = programRules.filter((rule) => {
        let node: typeof rule | undefined = rule;
        while (node) {
          if (/^unmatched courses$/i.test(node.title ?? "")) return false;
          node = node.parentId ? byId.get(node.parentId) : undefined;
        }
        return true;
      });
      if (!requirements.length) return [];
      const ids = new Map(
        requirements.map((rule, index) => [rule.id, `r${index + 1}`]),
      );
      return [
        {
          programCode: program.code!,
          title: program.title,
          appliedVersion: program.appliedVersion,
          catalogTerm: program.catalogTerm,
          requirements: requirements.map((rule) => ({
            id: ids.get(rule.id)!,
            parentId: rule.parentId ? (ids.get(rule.parentId) ?? null) : null,
            title: rule.title,
            kind: rule.kind,
            category: rule.category,
            minimumCredits: rule.minimumCredits,
            minimumCourses: rule.minimumCourses,
            alternatives: rule.alternatives.map((course) => ({
              subject: course.subject,
              number: course.number,
            })),
          })),
        },
      ];
    });
}

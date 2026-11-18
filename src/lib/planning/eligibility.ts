import type { Plan } from "./model.ts";
import {
  prerequisiteText,
  prerequisiteReferences,
  matchesPrerequisite,
} from "./course-catalog.ts";
import { termOrder, scheduledTerm } from "./schedule.ts";

export type Eligibility = "eligible" | "conditional" | "blocked" | "unknown";
/** Only evidence before the target term can satisfy a prerequisite. */
export function courseEligibility(
  plan: Plan,
  target: string,
  description: string | undefined,
  subject: string,
  subjects: { code: string; title: string }[],
): Eligibility {
  if (description === undefined) return "unknown";
  const excluded = description.match(
    /Not open to students with credit for ([^.]+(?:\.\d+[^.]*)?)/i,
  )?.[1];
  if (
    excluded &&
    prerequisiteReferences(excluded, subject, subjects).some((reference) =>
      plan.semesters.some((semester) =>
        semester.courses.some(
          (course) =>
            course.subject === reference.subject &&
            course.number === reference.number &&
            ["completed", "in-progress"].includes(course.status) &&
            course.evidenceRole !== "option",
        ),
      ),
    )
  )
    return "blocked";
  const text = prerequisiteText(description);
  if (!text) return /\bprereq/i.test(description) ? "unknown" : "eligible";
  const clause = text.split(/\b(?:not open|repeatability)\b/i)[0];
  const references = prerequisiteReferences(clause, subject, subjects);
  if (!references.length)
    return /\b(?:none|no prerequisites)\b/i.test(clause)
      ? "eligible"
      : "unknown";
  const states = references.map((reference) => {
    const evidence = plan.semesters.flatMap((semester) =>
      semester.courses
        .filter(
          (course) =>
            matchesPrerequisite(reference, course, clause) &&
            course.evidenceRole !== "option",
        )
        .map((course) => ({
          course,
          term: course.id
            ? scheduledTerm(plan, course.id, semester.term)
            : semester.term,
        })),
    );
    if (
      evidence.some(
        ({ course, term }) =>
          course.status === "completed" &&
          (!term || termOrder(term, target) < 0),
      )
    )
      return "eligible";
    if (
      evidence.some(
        ({ course, term }) =>
          course.status === "in-progress" &&
          term &&
          termOrder(term, target) < 0,
      )
    )
      return "conditional";
    return "blocked";
  });
  // Mixed Boolean rules, grades, placement and permission require evidence beyond attendance.
  const logical = clause.replace(/\bor (?:above|higher)\b/gi, "");
  if (/\band\b/i.test(logical) && /\bor\b/i.test(logical)) return "unknown";
  const alternative = /\bor\b/i.test(logical);
  const passed = alternative
    ? states.some((state) => state !== "blocked")
    : states.every((state) => state !== "blocked");
  if (!passed) return "blocked";
  if (
    /\b(?:grade|permission|standing|GPA|major|concur)\b/i.test(clause) ||
    (/\bplacement\b/i.test(clause) && !/\bor\s+[^;]*placement\b/i.test(clause))
  )
    return "unknown";
  return alternative && states.includes("eligible")
    ? "eligible"
    : states.includes("conditional")
      ? "conditional"
      : "eligible";
}

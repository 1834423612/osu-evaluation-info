import type { Plan } from "./model.ts";
import type { PdfLine } from "./parser.ts";
/** Recognize only explicit program labels and narrow numeric requirements; discard all prose. */
export function addProvenance(plan: Plan, lines: PdfLine[]): Plan {
  const documentId = "document-1";
  plan.documents = [
    {
      id: documentId,
      source: plan.source,
      pdfOrigin: plan.pdfOrigin,
      auditMode: plan.auditMode,
      catalogTerm: plan.catalogTerm,
    },
  ];
  let courseIndex = 0;
  for (const semester of plan.semesters) {
    semester.documentId = documentId;
    for (const course of semester.courses) {
      course.id = `course-${++courseIndex}`;
      course.documentId = documentId;
    }
  }
  let program: Plan["programs"][number] | undefined;
  let requirement: Plan["requirements"][number] | undefined;
  const numbered = new Map<string, string>();
  const makeProgram = (code: string | null) => {
    const p = {
      id: `program-${plan.programs.length + 1}`,
      documentId,
      code,
      declaration: "unknown" as const,
      appliedVersion: null,
      catalogTerm: plan.catalogTerm,
      remainingCredits: null,
    };
    plan.programs.push(p);
    numbered.clear();
    requirement = undefined;
    return p;
  };
  for (const { text: raw, page } of lines) {
    const line = raw.trim().replace(/\s+/g, " ");
    if (/@|student\s*(?:name|id)|advisor|https?:/i.test(line)) continue;
    const heading = line.match(
      /^Program\s*:\s*([A-Z][A-Z0-9-]{0,39})(?:\s*\((declared|undeclared)\))?$/,
    );
    if (heading) {
      program = makeProgram(heading[1]);
      if (heading[2])
        program.declaration = heading[2] as "declared" | "undeclared";
      continue;
    }
    const version = line.match(
      /\bApplied\s+Version\s*:?\s*((?:AU|SP|SU)\s*20\d{2})\b/i,
    );
    if (version) {
      if (!program || program.appliedVersion !== null)
        program = makeProgram(null);
      program.appliedVersion = version[1].replace(/\s/g, "").toUpperCase();
      continue;
    }
    const remaining = line.match(
      /^Remaining Credits\s*:\s*(\d{1,3}(?:\.\d+)?)$/i,
    );
    if (remaining && program) {
      program.remainingCredits = Number(remaining[1]);
      continue;
    }
    const marker = line.match(/^Requirement\s+(\d+(?:\.\d+)*)\s*:\s*(.*)$/i);
    if (marker) {
      program ??= makeProgram(null);
      const parentNumber = marker[1].split(".").slice(0, -1).join(".");
      const credit = marker[2].match(
        /^Minimum\s+(\d{1,3}(?:\.\d+)?)\s+credits?$/i,
      );
      const count = marker[2].match(/^Choose\s+(\d{1,2})\s+courses?$/i);
      requirement = {
        id: `requirement-${plan.requirements.length + 1}`,
        documentId,
        programId: program.id,
        parentId: numbered.get(parentNumber) ?? null,
        kind: credit
          ? "credits"
          : count
            ? "courses"
            : /^All of$/i.test(marker[2])
              ? "all"
              : /^Any of$/i.test(marker[2])
                ? "any"
                : "unknown",
        minimumCredits: credit ? Number(credit[1]) : null,
        minimumCourses: count ? Number(count[1]) : null,
        alternatives: [],
        page,
      };
      plan.requirements.push(requirement);
      numbered.set(marker[1], requirement.id);
      continue;
    }
    if (requirement) {
      for (const m of line.matchAll(
        /\b([A-Z][A-Z&]{1,11})\s+(\d{4}(?:\.\d{1,2})?[A-Z]?)\b/g,
      )) {
        if (["AU", "SP", "SU"].includes(m[1])) continue;
        if (
          !requirement.alternatives.some(
            (a) => a.subject === m[1] && a.number === m[2],
          )
        )
          requirement.alternatives.push({ subject: m[1], number: m[2] });
        const course = plan.semesters
          .flatMap((s) => s.courses)
          .find((c) => c.subject === m[1] && c.number === m[2]);
        if (
          course?.id &&
          !plan.allocations.some(
            (a) =>
              a.courseId === course.id && a.requirementId === requirement!.id,
          )
        )
          plan.allocations.push({
            courseId: course.id,
            requirementId: requirement.id,
            confirmed: false,
          });
      }
    }
  }
  return plan;
}

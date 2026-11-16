import type { Plan } from "./model.ts";
import type { PdfLine } from "./parser.ts";
function categoryFor(
  line: string,
): NonNullable<Plan["requirements"][number]["category"]> {
  const categories = [
    ["launch", /launch seminar/i],
    ["writing", /writing|literacy/i],
    ["math", /math|quantitative|calculus|statistics/i],
    ["arts", /visual|performing|art\/design/i],
    ["history", /historical|cultural/i],
    ["science", /natural science|science courses/i],
    ["social", /social and behavioral/i],
    ["diversity", /race.*ethnicity|gender diversity/i],
    ["citizenship", /citizenship/i],
    ["reflection", /reflection/i],
    ["core", /major core/i],
    ["electives", /elective/i],
    ["survey", /college survey/i],
  ] as const;
  return categories.find(([, pattern]) => pattern.test(line))?.[0] ?? "general";
}
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
  let stack: Array<{ id: string; x: number }> = [];
  const makeProgram = (code: string | null, fresh = false) => {
    const existing =
      !fresh && code ? plan.programs.find((p) => p.code === code) : undefined;
    const p = {
      id: `program-${plan.programs.length + 1}`,
      documentId,
      code,
      declaration: "unknown" as const,
      appliedVersion: null,
      catalogTerm: plan.catalogTerm,
      remainingCredits: null,
    };
    if (!existing) plan.programs.push(p);
    numbered.clear();
    stack = [];
    requirement = undefined;
    return existing ?? p;
  };
  for (const { text: raw, page, cells } of lines) {
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
    const academicCode = line.match(
      /\b([A-Z][A-Z0-9]{1,24}-(?:BA|BS|PRE))\s*(?:\((?:not )?declared\))?$/,
    )?.[1];
    const knownCode =
      academicCode ??
      (/^Computer (?:and|&) Information Science\b/i.test(line)
        ? "CIS"
        : /^Information Systems\b/i.test(line)
          ? "IS"
          : /^(?:New |Legacy )?General Education\b/i.test(line)
            ? "GE"
            : null);
    if (knownCode && program?.code !== knownCode) {
      program = makeProgram(knownCode);
      continue;
    }
    const version = line.match(
      /\bApplied\s+Version\s*:?\s*((?:AU|SP|SU)\s*20\d{2})\b/i,
    );
    if (version) {
      if (
        !program ||
        (program.appliedVersion !== null &&
          program.appliedVersion !==
            version[1].replace(/\s/g, "").toUpperCase())
      )
        program = makeProgram(program?.code ?? null, true);
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
        category: categoryFor(line),
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
    const standard =
      plan.source === "standard-audit" || plan.source === "compact-audit";
    const dashes = line.match(/^([–—-]{2,})\s*(.+)/);
    if (
      standard &&
      (dashes || /\(Courses:\s*\(/i.test(line)) &&
      !/^Courses:/i.test(line)
    ) {
      program ??= makeProgram(null);
      const depth = dashes ? Math.floor(dashes[1].length / 2) : 0;
      while (stack.length && stack[stack.length - 1].x >= depth) stack.pop();
      const credit = line.match(
        /\b(?:minimum(?:\s+of)?|at least)\s+(\d{1,3}(?:\.\d+)?)\s*(?:credits?|hours?)\b/i,
      );
      const codes = [
        ...line.matchAll(
          /\b([A-Z][A-Z&]{1,11})\s+(\d{4}(?:\.\d{1,2})?[A-Z]?)\b/g,
        ),
      ].filter((m) => !["AU", "SP", "SU"].includes(m[1]));
      requirement = {
        id: `requirement-${plan.requirements.length + 1}`,
        documentId,
        programId: program.id,
        parentId: stack.at(-1)?.id ?? null,
        hierarchyReviewed: false,
        category: categoryFor(line),
        kind: credit ? "credits" : codes.length === 1 ? "courses" : "unknown",
        minimumCredits: credit ? Number(credit[1]) : null,
        minimumCourses: !credit && codes.length === 1 ? 1 : null,
        alternatives: [],
        page,
      };
      plan.requirements.push(requirement);
      stack.push({ id: requirement.id, x: depth });
    }
    // Free-form prose is never stored. Only explicit numeric clauses and logical
    // group markers become candidates, and every inferred hierarchy needs review.
    if (
      plan.source === "expanded-audit" &&
      !/\b(?:not|except|unless)\b/i.test(line)
    ) {
      const credit = line.match(
        /\b(?:minimum(?:\s+of)?|at least)\s+(\d{1,3}(?:\.\d+)?)\s*(?:credits?|hours?|h)\b/i,
      );
      const count = line.match(
        /\b(?:minimum(?:\s+of)?|at least)\s+(\d{1,2})\s+courses?\b/i,
      );
      const group = line.match(/\b(all|any) of\b/i);
      if (credit || count || group) {
        program ??= makeProgram(null);
        const x = cells?.find((c) => /[A-Za-z]/.test(c.text))?.x ?? 0;
        while (stack.length && stack[stack.length - 1].x >= x) stack.pop();
        requirement = {
          id: `requirement-${plan.requirements.length + 1}`,
          documentId,
          programId: program.id,
          parentId: stack.at(-1)?.id ?? null,
          hierarchyReviewed: false,
          category: categoryFor(line),
          kind: credit
            ? "credits"
            : count
              ? "courses"
              : group?.[1].toLowerCase() === "all"
                ? "all"
                : "any",
          minimumCredits: credit ? Number(credit[1]) : null,
          minimumCourses: count ? Number(count[1]) : null,
          alternatives: [],
          page,
        };
        plan.requirements.push(requirement);
        if (group) stack.push({ id: requirement.id, x });
        continue;
      }
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

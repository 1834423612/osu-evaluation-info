import { academicTitle } from "./academic-text.ts";
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
  const headingFonts = new Set(
    lines
      .flatMap((l) => l.cells ?? [])
      .filter((c) => /[A-Z0-9]+-(?:BA|BS|PRE|MN|CT)\b/.test(c.text) && c.font)
      .map((c) => c.font),
  );
  let previousAcademicLine = "";
  for (const { text: raw, page, cells } of lines) {
    const line = raw
      .trim()
      .replace(/\s+/g, " ")
      .replace(/^\d{1,2}\s+(?=[A-Za-z])/, "");
    if (
      /@|(?:[a-z0-9-]+\.)+(?:edu|com|org)\/|student\s*(?:name|id)|advisor|https?:/i.test(
        line,
      )
    )
      continue;
    const heading = line.match(
      /^Program\s*:\s*([A-Z][A-Z0-9-]{0,39})(?:\s*\((declared|undeclared)\))?$/,
    );
    if (heading) {
      program = makeProgram(heading[1]);
      if (heading[2])
        program.declaration = heading[2] as "declared" | "undeclared";
      continue;
    }
    if (
      (plan.source === "standard-audit" || plan.source === "compact-audit") &&
      cells?.some((c) => (c.height ?? 0) >= 12) &&
      /^(?:General World Language Requirement|Civic Literacy|Additional GE|Non-ASC|Courses Listed|General Graduation Requirements)/.test(
        line,
      )
    ) {
      program = makeProgram(null, true);
      program.title = academicTitle(line);
      continue;
    }
    const academicCode = line.match(
      /\b([A-Z][A-Z0-9]{1,24}-(?:BA|BS|PRE|MN|CT))\s*(?:\((?:not )?declared\)|Only available in Planned View)?$/,
    )?.[1];
    const knownCode =
      academicCode ??
      (/^Computer (?:and|&) Information Science\s*-\s*(?:BA|BS)\s*-?$/i.test(
        line,
      )
        ? "CIS"
        : /^Information Systems(?:\s*-\s*BSBUSADM\s*-?)?$/i.test(line)
          ? "IS"
          : /^(?:New |Legacy )?General Education Requirements\s*(?:-.*)?$/.test(
                line,
              )
            ? "GE"
            : null);
    if (knownCode) {
      if (program?.code !== knownCode) program = makeProgram(knownCode);
      program!.title = academicTitle(
        line
          .replace(/Only available in Planned View|\(not declared\)/gi, "")
          .trim(),
      );
      if (/\(not declared\)|Only available in Planned View/i.test(line))
        program!.declaration = "undeclared";
      else if (/\(declared\)/i.test(line)) program!.declaration = "declared";
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
    if (plan.source === "expanded-audit" && headingFonts.size && program) {
      const headingCells = (cells ?? []).filter(
        (c) =>
          c.font &&
          headingFonts.has(c.font) &&
          /[A-Za-z]/.test(c.text) &&
          !/^(?:Applied Version|Catalog Term|PGPA|Undergraduate|Last computed)/i.test(
            c.text,
          ),
      );
      if (headingCells.length && !/Only available in Planned View/.test(line)) {
        const x = headingCells[0].x;
        const title = academicTitle(headingCells.map((c) => c.text).join(" "));
        if (title && /^[A-Z]/.test(title)) {
          while (stack.length && stack.at(-1)!.x >= x - 2) stack.pop();
          requirement = {
            id: `requirement-${plan.requirements.length + 1}`,
            documentId,
            programId: program.id,
            parentId: stack.at(-1)?.id ?? null,
            hierarchyReviewed: true,
            title,
            category: categoryFor(title),
            kind: "unknown",
            minimumCredits: null,
            minimumCourses: null,
            alternatives: [],
            page,
          };
          plan.requirements.push(requirement);
          stack.push({ id: requirement.id, x });
        }
        continue;
      }
      if (/^(?:Fulfill (?:all|any)|Take at least)/i.test(line)) {
        if (requirement) {
          const credits = line.match(/at least (\d+(?:\.\d+)?) hours?/i);
          const courses = line.match(/at least (\d+) courses?/i);
          requirement.kind = credits
            ? "credits"
            : courses
              ? "courses"
              : /Fulfill all/i.test(line)
                ? "all"
                : "any";
          requirement.minimumCredits = credits
            ? Number(credits[1])
            : requirement.minimumCredits;
          requirement.minimumCourses = courses
            ? Number(courses[1])
            : requirement.minimumCourses;
        }
        continue;
      }
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
        title: academicTitle(marker[2]),
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
      (dashes ||
        /\((?:Courses|Milestones):\s*\(/i.test(line) ||
        /^(?:[A-Z][A-Z&]+ \d{4}|.+\(through )/.test(line)) &&
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
        hierarchyReviewed: true,
        title: academicTitle(
          line
            .replace(/^[–—-]+\s*/, "")
            .split(
              /\s*\((?:through|Courses:|Milestones:|\d+(?:\.\d+)?\s*hours?)/i,
            )[0]
            .replace(/\s+(?:Autumn|Spring|Summer)\s*['’]?\d{2,4}.*$/, ""),
        ),
        reportedStatus: /\b[1-9]\d* remaining\b|\bremaining$/.test(line)
          ? "remaining"
          : /\b[1-9]\d* planned\b|through placeholder|PLANNED FOR/i.test(line)
            ? "planned"
            : /\b[1-9]\d* in progress\b|\bcurrently taking\b/i.test(line)
              ? "in-progress"
              : /\b[1-9]\d* taken\b|\b(?:KA|EM)$/.test(line)
                ? "completed"
                : undefined,
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
    if (
      plan.source === "expanded-audit" &&
      !/^(?:Take |Fulfill |Course with|Courses:|Courses Progress|Applied Version|Catalog Term)|\bHOURS\b|\bCURRENTLY TAKING\b|\bTAKEN IN\b|\bTRANSFERRED\b|\bPLANNED FOR\b|\bhidden unless taken\b|^\d+\s*$/.test(
        line,
      ) &&
      !/\bthrough|\bconstraint|\bdouble.count|^The |^This |^You |^Each /i.test(
        line,
      )
    ) {
      previousAcademicLine = line;
    }
    // Text-only fallback retains numeric clauses with unresolved hierarchy.
    // Geometry-backed report headings above establish hierarchy automatically.
    if (
      plan.source === "expanded-audit" &&
      !headingFonts.size &&
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
          title: academicTitle(previousAcademicLine),
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
    if (
      requirement &&
      !/transferred from|transfer note|SOURCE_|hidden unless taken|^Course with an attribute|^Excluded/i.test(
        line,
      )
    ) {
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
            confirmed: course.evidenceRole === "observation",
          });
      }
    }
  }
  return plan;
}

import { emptyPlan, planSchema, type Plan, type PlanCourse } from "./model.ts";
import { academicTitle } from "./academic-text.ts";
import { reportRows } from "./pdf-rows.ts";
import { addProvenance } from "./provenance.ts";
export type PdfLine = {
  text: string;
  page: number;
  cells?: Array<{
    x: number;
    text: string;
    width?: number;
    font?: string;
    height?: number;
  }>;
};
export type ParseResult = {
  plan: Plan;
  warnings: Array<"review" | "limited" | "empty" | "status" | "projects">;
};
/** Layout is identified from report text and geometry. Names never determine content. */
export function detectPlanLayout(lines: PdfLine[], _filename?: string): Plan["source"] | null {
  const header = lines.slice(0, 400).map((line) => line.text).join("\n");
  if (/Course or Activity|Student Plan/i.test(header)) return "student-plan";
  if (/Applied Version/i.test(header) && /Fulfill (?:all|any)|at least \d+ (?:course|hour)/i.test(header)) return "expanded-audit";
  if (/Milestones/i.test(header) && /Course\s+Term\s+Gr\b/i.test(header)) return "compact-audit";
  if (/AUDIT REPORT/i.test(header)) {
    return /[–—-]{2}|\b(?:CURRENTLY TAKING|TAKEN IN|PLANNED FOR|TRANSFERRED)\b/i.test(header) ? "standard-audit" : "compact-audit";
  }
  return null;
}
/** Conservative candidate extraction, not a degree audit or graduation calculation. */
export function parsePlanLines(
  lines: PdfLine[],
  source: Plan["source"],
  origin: Plan["pdfOrigin"] = "export",
): ParseResult {
  lines = reportRows(
    lines,
    source === "standard-audit" || source === "compact-audit",
  );
  const plan = emptyPlan();
  plan.source = source;
  plan.pdfOrigin = origin;
  let semester: Plan["semesters"][number] = {
    term: null,
    reportedCredits: null,
    courses: [],
  };
  plan.semesters.push(semester);
  const versions = new Set<string>(),
    catalogs = new Set<string>();
  const modes = new Set<string>();
  let creditColumn: number | null = null;
  const campuses: Record<string, NonNullable<Plan["semesters"][number]["campus"]>> = { Columbus: "COL", Mansfield: "MNS", Lima: "LMA", Marion: "MRN", Newark: "NWK", Wooster: "WST" };
  const conflictingCredits = new WeakSet<PlanCourse>();
  const conflictingStatuses = new WeakSet<PlanCourse>();
  for (const { text: raw, page, cells } of lines) {
    const line = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
    // Ignore known identity/footer lines before any matching. Raw strings are never returned.
    if (
      /@|https?:|student\s*(?:id|name)|advisor|prepared\s+(?:by|for)|printed\s+by|name\s*:/i.test(
        line,
      )
    )
      continue;
    const version = line.match(
      /\bApplied\s+Version\s*:?\s*((?:AU|SP|SU)\s*20\d{2})\b/i,
    );
    if (version) versions.add(version[1].replace(/\s/g, "").toUpperCase());
    const catalog = line.match(
      /\bCatalog\s+Term\s*:?\s*((?:Autumn|Spring|Summer)\s*20\d{2})\b/i,
    );
    if (catalog) catalogs.add(catalog[1].replace(/\s/g, ""));
    if (version || catalog) continue;
    const column = cells?.find((c) =>
      /^(?:credits?|hours?)$/i.test(c.text.trim()),
    );
    if (column) {
      creditColumn = column.x;
      continue;
    }
    if (
      source === "student-plan" &&
      (/^(?:transfer|transferred)(?:\s|$)/i.test(line) ||
        /^(?:test|exam(?:ination)?|advanced placement)(?:\s|$)/i.test(line))
    ) {
      semester = {
        term: null,
        creditOrigin: /^trans/i.test(line) ? "transfer" : "exam",
        reportedCredits: null,
        courses: [],
      };
      plan.semesters.push(semester);
      creditColumn = null;
      continue;
    }
    if (
      /^Official(?: Audit)?$/i.test(line) ||
      /Only available in Planned View/i.test(line)
    )
      modes.add("official");
    if (/^Planned Audit$/i.test(line)) modes.add("planned");
    const term = line.match(
      /^(Autumn|Spring|Summer)\s*(20\d{2})(?:\s*[-–:]?\s*(\d+(?:\.\d+)?)\s*(?:h(?:ours?)?|credits?)(?:\s+attempted)?)?$/i,
    );
    if (term && source === "student-plan" && origin === "export") {
      semester = {
        term:
          term[1][0].toUpperCase() + term[1].slice(1).toLowerCase() + term[2],
        creditOrigin: "institutional",
        reportedCredits: term[3] ? Number(term[3]) : null,
        courses: [],
      };
      plan.semesters.push(semester);
      creditColumn = null;
      continue;
    }
    const campus = line.match(/^(?:Campus\s*[:·-]?\s*)?(Columbus|Mansfield|Lima|Marion|Newark|Wooster)$/i);
    if (campus && semester.term && source === "student-plan") {
      semester.campus = campuses[campus[1][0].toUpperCase() + campus[1].slice(1).toLowerCase()];
      continue;
    }
    // Audits repeat courses in requirement nodes. Keep candidates unassigned; never sum them.
    const throughIndex = line.search(/\bthrough\s+(?=[A-Z][A-Z&]+\s+\d{4})/);
    const courseText = throughIndex >= 0 ? line.slice(throughIndex) : line;
    const matches = [
      ...courseText.matchAll(
        /\b([A-Z][A-Z&]{1,11})\s+(\d{4}(?:\.\d{1,2})?[A-Z]?)\b/g,
      ),
    ].filter((m) => !["AU", "SP", "SU"].includes(m[1]));
    if (!matches.length && !/\bplaceholder\b/i.test(line)) continue;
    // Multiple course alternatives/columns cannot establish status or credits reliably.
    const credit =
      matches.length <= 1 &&
      !/\b(?:minimum|at least|up to|maximum|per course|total|require[ds]?)\b/i.test(
        line,
      )
        ? line.match(
            /(?:^|[\s(])(\d{1,2}(?:\.\d+)?)\s*(?:h(?:ours?)?|credits?)\b/i,
          )
        : null;
    const creditCell =
      creditColumn === null
        ? undefined
        : cells?.find(
            (c) =>
              Math.abs(c.x - creditColumn!) < 18 &&
              /^(?:\d{1,2}(?:\.\d+)?|[-–])$/.test(c.text.trim()),
          );
    const tableCredits =
      creditCell && /^\d/.test(creditCell.text.trim())
        ? Number(creditCell.text.trim())
        : null;

    const rowTerm = line.match(
      /\b(Autumn|Spring|Summer)\s*['’]?(\d{2}|20\d{2})\b/i,
    );
    const observedTerm = rowTerm
      ? rowTerm[1][0].toUpperCase() +
        rowTerm[1].slice(1).toLowerCase() +
        (rowTerm[2].length === 2 ? "20" : "") +
        rowTerm[2]
      : undefined;
    const earned =
      ["transfer", "exam"].includes(semester.creditOrigin ?? "") ||
      (/\b(?:KA|KB|KC|KD|EM)\b/.test(line) && !!observedTerm);
    const outcome = /\bwithdrawn\b|\bgrade\s*:?\s*W\b|\sW\s*$/i.test(line) ? "withdrawn"
      : /\bdropped\b/i.test(line) ? "dropped"
      : /\bfailed\b|\bgrade\s*:?\s*(?:F|E|EN)\b/i.test(line) ? "failed" : null;
    const status: PlanCourse["status"] = outcome ?? (earned
      ? "completed"
      : /\bplanned\b/i.test(line) ||
          (source === "student-plan" && /\bplaceholder\b/i.test(line))
        ? "planned"
        : /\bin.progress\b|currently taking|\bregistered\b/i.test(line)
          ? "in-progress"
          : /\bcompleted\b|\btaken in\b|\btransferred\b/i.test(line)
            ? "completed"
            : "unknown");
    const candidates = matches.length
      ? matches.map((m) => ({ subject: m[1], number: m[2] }))
      : [{ subject: null, number: null }];
    for (const candidate of candidates) {
      const codeText = candidate.subject
        ? `${candidate.subject} ${candidate.number}`
        : "";
      const titleStart = codeText
        ? courseText.indexOf(codeText) + codeText.length
        : 0;
      const titleText = courseText
        .slice(titleStart)
        .replace(/^\s*Placeholder:\s*/i, "")
        .split(
          /\s+\(?\d+(?:\.\d+)?\s*(?:hours?|credits?)\b|\s+(?:CURRENTLY TAKING|TAKEN IN|TRANSFERRED|PLANNED FOR)\b|\(through|\(Courses:/i,
        )[0]
        .replace(/\s+\([A-Z0-9]{4}\).*$/, "")
        .replace(
          /\s+[-–]?\s*(?:\d+(?:\.\d+)?|[-–])\s+(?:Planned|Placeholder|KA|EM)\s*$/i,
          "",
        )
        .replace(/\s*[-–]?\s*(?:Planned|Placeholder)\s*$/i, "")
        .trim();
      const course: PlanCourse = {
        ...candidate,
        title: academicTitle(titleText),
        term: observedTerm,
        section:
          source === "student-plan"
            ? line.match(/\(([A-Z0-9]{4})\)/)?.[1]
            : undefined,
        session: line.match(/Session\s*([12])\b/i)?.[1] as
          "1" | "2" | undefined,
        kind: /\bplaceholder\b/i.test(line) ? "placeholder" : "course",
        evidenceRole:
          source === "student-plan" ||
          earned || !!outcome ||
          /\bthrough\b|\b(?:currently taking|taken in|transferred|in.progress|completed|planned|registered)\b/i.test(
            line,
          )
            ? "observation"
            : "option",
        credits:
          matches.length <= 1 && tableCredits !== null
            ? tableCredits
            : credit
              ? Number(credit[1])
              : null,
        status,
        repeated: /\b(?:retake|repeat(?:ed)?)\b/i.test(line) || undefined,
        page,
      };
      const existing = semester.courses.find(
        (c) =>
          c.subject === course.subject &&
          c.number === course.number &&
          c.kind === course.kind &&
          (c.evidenceRole !== "observation" || course.evidenceRole !== "observation" || (c.term ?? null) === (course.term ?? null)) &&
          (![c.status, course.status].some(status => ["withdrawn", "dropped", "failed"].includes(status)) || c.status === course.status) &&
          course.subject !== null,
      );
      if (!existing) {
        if (semester.courses.length >= 100)
          throw Error("Too many candidates; split the PDF");
        semester.courses.push(course);
      } else if (
        course.evidenceRole === "observation" &&
        existing.evidenceRole !== "observation"
      ) {
        Object.assign(existing, course);
      } else if (course.evidenceRole === existing.evidenceRole) {
        if (
          existing.credits !== null &&
          course.credits !== null &&
          existing.credits !== course.credits
        ) {
          conflictingCredits.add(existing);
          existing.credits = null;
        } else if (!conflictingCredits.has(existing))
          existing.credits ??= course.credits;
        if (existing.status === "unknown" && !conflictingStatuses.has(existing))
          existing.status = course.status;
        else if (
          course.status !== "unknown" &&
          course.status !== existing.status
        ) {
          conflictingStatuses.add(existing);
          existing.status = "unknown";
        }
      }
    }
  }
  if (versions.size === 1) plan.appliedVersion = [...versions][0];
  if (catalogs.size === 1) plan.catalogTerm = [...catalogs][0];
  if (modes.size === 1) plan.auditMode = [...modes][0] as Plan["auditMode"];
  plan.semesters = plan.semesters.filter((s) => s.term || s.courses.length);
  return {
    plan: planSchema.parse(addProvenance(plan, lines)),
    warnings: [
      ...(source !== "student-plan" ? (["limited"] as const) : []),

      ...(plan.semesters.length ? [] : (["empty"] as const)),
    ],
  };
}

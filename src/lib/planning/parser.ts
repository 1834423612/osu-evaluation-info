import { emptyPlan, planSchema, type Plan, type PlanCourse } from "./model.ts";
import { addProvenance } from "./provenance.ts";
export type PdfLine = {
  text: string;
  page: number;
  cells?: Array<{ x: number; text: string }>;
};
export type ParseResult = {
  plan: Plan;
  warnings: Array<"review" | "limited" | "empty" | "status" | "projects">;
};
/** Conservative candidate extraction, not a degree audit or graduation calculation. */
export function parsePlanLines(
  lines: PdfLine[],
  source: Plan["source"],
  origin: Plan["pdfOrigin"] = "export",
): ParseResult {
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
    if (/^Official(?: Audit)?$/i.test(line)) modes.add("official");
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
    // Audits repeat courses in requirement nodes. Keep candidates unassigned; never sum them.
    const matches = [
      ...line.matchAll(
        /\b([A-Z][A-Z&]{1,11})\s+(\d{4}(?:\.\d{1,2})?[A-Z]?)\b/g,
      ),
    ].filter((m) => !["AU", "SP", "SU"].includes(m[1]));
    if (!matches.length && !/\bplaceholder\b/i.test(line)) continue;
    // Multiple course alternatives/columns cannot establish status or credits reliably.
    const credit =
      matches.length <= 1 && source === "student-plan"
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

    const status: PlanCourse["status"] = /\bplanned\b/i.test(line)
      ? "planned"
      : /\bin.progress\b/i.test(line)
        ? "in-progress"
        : /\bcompleted\b/i.test(line)
          ? "completed"
          : "unknown";
    const candidates = matches.length
      ? matches.map((m) => ({ subject: m[1], number: m[2] }))
      : [{ subject: null, number: null }];
    for (const candidate of candidates) {
      const course: PlanCourse = {
        ...candidate,
        kind: /\bplaceholder\b/i.test(line) ? "placeholder" : "course",
        credits:
          matches.length <= 1 && tableCredits !== null
            ? tableCredits
            : credit
              ? Number(credit[1])
              : null,
        status,
        page,
      };
      if (
        !semester.courses.some(
          (c) =>
            c.subject === course.subject &&
            c.number === course.number &&
            c.kind === course.kind &&
            course.subject !== null,
        )
      ) {
        if (semester.courses.length >= 100)
          throw Error("Too many candidates; split the PDF");
        semester.courses.push(course);
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
      "review",
      "status",
      ...(source !== "student-plan" ? (["limited", "projects"] as const) : []),
      ...(plan.semesters.length ? [] : (["empty"] as const)),
    ],
  };
}

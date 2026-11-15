import { emptyPlan, planSchema, type Plan, type PlanCourse } from "./model.ts";
export type PdfLine = { text: string; page: number };
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
  for (const { text: raw, page } of lines) {
    const line = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
    // Ignore known identity/footer lines before any matching. Raw strings are never returned.
    if (
      /@|https?:|student\s*(?:id|name)|advisor|prepared\s+(?:by|for)|printed\s+by|name\s*:/i.test(
        line,
      )
    )
      continue;
    const version = line.match(
      /^Applied Version\s*:?\s*((?:AU|SP|SU)20\d{2})$/i,
    );
    if (version) versions.add(version[1].toUpperCase());
    const catalog = line.match(
      /^Catalog Term\s*:?\s*((?:Autumn|Spring|Summer)\s*20\d{2})$/i,
    );
    if (catalog) catalogs.add(catalog[1].replace(/\s/g, ""));
    if (/^Official(?: Audit)?$/i.test(line)) modes.add("official");
    if (/^Planned Audit$/i.test(line)) modes.add("planned");
    const term = line.match(
      /^(Autumn|Spring|Summer)\s*(20\d{2})(?:\s*[-–:]?\s*(\d+(?:\.\d+)?)\s*(?:h|credits?))?$/i,
    );
    if (term && source === "student-plan" && origin === "export") {
      semester = {
        term:
          term[1][0].toUpperCase() + term[1].slice(1).toLowerCase() + term[2],
        reportedCredits: term[3] ? Number(term[3]) : null,
        courses: [],
      };
      plan.semesters.push(semester);
      continue;
    }
    // Audits repeat courses in requirement nodes. Keep candidates unassigned; never sum them.
    const matches = [
      ...line.matchAll(
        /\b([A-Z][A-Z&]{1,11})\s+(\d{4}(?:\.\d{1,2})?[A-Z]?)\b/g,
      ),
    ];
    if (!matches.length && !/\bplaceholder\b/i.test(line)) continue;
    // Multiple course alternatives/columns cannot establish status or credits reliably.
    const credit =
      matches.length <= 1
        ? line.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:h|credits?)\b/i)
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
        credits: credit ? Number(credit[1]) : null,
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
    plan: planSchema.parse(plan),
    warnings: [
      "review",
      "status",
      ...(source !== "student-plan" ? (["limited", "projects"] as const) : []),
      ...(plan.semesters.length ? [] : (["empty"] as const)),
    ],
  };
}

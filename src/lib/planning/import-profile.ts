import type { Plan } from "./model.ts";

export type ImportProfile = "auto" | "student" | "official" | "planned";

export function importProfile(profile: ImportProfile) {
  return {
    source: profile === "student" ? "student-plan" : "auto",
    origin:
      profile === "official" || profile === "planned"
        ? "browser-print"
        : "export",
    auditMode:
      profile === "official" || profile === "planned" ? profile : "unknown",
  } as const;
}

/** Report scope and program declaration are independent facts. */
export function importCoverage(plan: Plan) {
  const has = (source: Plan["source"], mode?: Plan["auditMode"]) =>
    plan.documents.some(
      (d) => d.source === source && (!mode || d.auditMode === mode),
    );
  return {
    student: has("student-plan"),
    official: has("expanded-audit", "official"),
    planned: plan.programs.some(
      (p) =>
        plan.documents.some(
          (d) => d.id === p.documentId && d.auditMode === "planned",
        ) &&
        plan.requirements.some(
          (r) =>
            r.programId === p.id && !/^unmatched courses$/i.test(r.title ?? ""),
        ),
    ),
    outlineOnly: plan.documents.some((d) =>
      ["standard-audit", "compact-audit"].includes(d.source),
    ),
    unlabelled: plan.documents.some(
      (d) => d.source.includes("audit") && d.auditMode === "unknown",
    ),
  };
}

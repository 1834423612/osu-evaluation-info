import { planSchema, type Plan } from "./model.ts";
import { requirementProgress } from "./snapshots.ts";
import { boardCourses } from "./workspace.ts";
import { termOrder } from "./schedule.ts";

export type SampleCourse = {
  subject: string;
  number: string;
  credits: number | null;
  semesterIndex: number;
};
export type PublicSample = {
  id: string;
  program: string;
  url: string;
  reviewStatus: string;
  label?: string;
  courses: SampleCourse[];
};
export type Rating = {
  score: number;
  responses: number;
  instrument: "SEI" | "SSLE";
};
export type PlanningCandidate = {
  subject: string;
  number: string;
  key: string;
  credits: number | null;
  ruleIds: string[];
  unreviewed: boolean;
  sample: boolean;
  sampleMatch: boolean;
  planned: boolean;
  conflict: boolean;
  rating?: Rating;
  score: number;
};
export type RecommendationOptions = {
  programId: string;
  currentTerm: string;
  targetTerm: string;
  sample?: PublicSample;
  sampleYear: number;
  maxCredits: number;
  quantitativeSubjects: string[];
  maxQuantitative: number;
  ratings?: Record<string, Rating>;
  catalogCredits?: Record<string, { min: number; max: number }>;
};

/** Local, explainable ranking. Never interprets prerequisites, grades or eligibility. */
export function recommendCourses(plan: Plan, options: RecommendationOptions) {
  if (
    !/^(Autumn|Spring|Summer)20\d{2}$/.test(options.currentTerm) ||
    !/^(Autumn|Spring|Summer)20\d{2}$/.test(options.targetTerm) ||
    termOrder(options.currentTerm, options.targetTerm) >= 0
  )
    throw Error("Choose a target semester after the current semester");
  if (
    !Number.isFinite(options.maxCredits) ||
    options.maxCredits < 1 ||
    options.maxCredits > 30 ||
    !Number.isInteger(options.maxQuantitative) ||
    options.maxQuantitative < 0 ||
    options.maxQuantitative > 8
  )
    throw Error("Invalid workload limits");
  const observations = new Map<string, Plan["semesters"][number]["courses"]>();
  for (const c of plan.semesters.flatMap((s) => s.courses))
    if (
      c.kind === "course" &&
      c.evidenceRole === "observation" &&
      c.subject &&
      c.number
    ) {
      const key = c.subject + " " + c.number;
      observations.set(key, [...(observations.get(key) ?? []), c]);
    }
  const pool = new Map<string, PlanningCandidate>();
  const get = (subject: string, number: string) => {
    const key = subject + " " + number;
    let candidate = pool.get(key);
    if (!candidate) {
      const facts = observations.get(key) ?? [];
      const credits = new Set(facts.map((c) => c.credits));
      candidate = {
        subject,
        number,
        key,
        credits: credits.size === 1 ? [...credits][0] : null,
        ruleIds: [],
        unreviewed: false,
        sample: false,
        sampleMatch: false,
        planned: facts.some((c) => c.status === "planned"),
        conflict:
          credits.size > 1 || new Set(facts.map((c) => c.status)).size > 1,
        score: 0,
      };
      pool.set(key, candidate);
    }
    return candidate;
  };
  for (const rule of plan.requirements.filter(
    (r) => r.programId === options.programId,
  )) {
    let satisfied = requirementProgress(plan, rule.id).state === "satisfied";
    let parent = rule.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      satisfied ||= requirementProgress(plan, parent).state === "satisfied";
      parent = plan.requirements.find((r) => r.id === parent)?.parentId ?? null;
    }
    if (satisfied) continue;
    for (const code of rule.alternatives) {
      const candidate = get(code.subject, code.number);
      if (rule.hierarchyReviewed) candidate.ruleIds.push(rule.id);
      else candidate.unreviewed = true;
    }
  }
  const sampleCredits = new Map<string, Set<number | null>>();
  for (const course of options.sample?.courses ?? []) {
    const key = course.subject + " " + course.number;
    sampleCredits.set(
      key,
      new Set([...(sampleCredits.get(key) ?? []), course.credits]),
    );
  }
  for (const course of options.sample?.courses ?? []) {
    const candidate = get(course.subject, course.number);
    candidate.sample = true;
    const season = course.semesterIndex % 2 === 0 ? "Autumn" : "Spring";
    candidate.sampleMatch ||=
      Math.floor(course.semesterIndex / 2) + 1 === options.sampleYear &&
      options.targetTerm.startsWith(season);
    if (
      candidate.credits === null &&
      !observations.get(candidate.key)?.length &&
      course.credits !== null
    )
      candidate.credits =
        sampleCredits.get(candidate.key)?.size === 1 ? course.credits : null;
  }
  for (const [key, facts] of observations)
    if (facts.some((c) => c.status === "planned")) {
      const [subject, number] = key.split(" ");
      get(subject, number);
    }
  for (const candidate of pool.values()) {
    const range = options.catalogCredits?.[candidate.key];
    if (
      range &&
      Number.isFinite(range.min) &&
      Number.isFinite(range.max) &&
      range.min >= 0 &&
      range.max <= 99 &&
      range.min <= range.max
    )
      candidate.credits = range.min === range.max ? range.min : null;
  }
  const candidates = [...pool.values()]
    .filter((c) => {
      const facts = observations.get(c.key) ?? [];
      // Conflicting snapshots stay visible. A consistent completed/in-progress
      // observation suppresses duplicate recommendations without claiming credit.
      return (
        !facts.length ||
        !facts.every(
          (f) => f.status === "completed" || f.status === "in-progress",
        )
      );
    })
    .map((c) => {
      const rating = options.ratings?.[c.key];
      const usable =
        rating &&
        Number.isFinite(rating.score) &&
        rating.score >= 1 &&
        rating.score <= 5 &&
        Number.isFinite(rating.responses) &&
        rating.responses > 0;
      const ratingValue = usable
        ? ((rating.score * rating.responses + 3.6 * 20) /
            (rating.responses + 20) -
            1) /
          4
        : 0.65;
      return {
        ...c,
        ...(usable ? { rating } : {}),
        score:
          (c.ruleIds.length ? 45 : c.unreviewed ? 15 : 0) +
          (c.sampleMatch ? 25 : c.sample ? 8 : 0) +
          (c.planned ? 10 : 0) +
          ratingValue * 15 -
          (c.conflict ? 20 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  // A bounded beam search balances credit capacity, prefix limits and repeated
  // alternatives. Unknown/conflicting credits are ranked but excluded from packs.
  type State = {
    items: PlanningCandidate[];
    credits: number;
    quant: number;
    covered: Set<string>;
    score: number;
  };
  const quantitative = new Set(
    options.quantitativeSubjects.map((s) => s.toUpperCase()),
  );
  const existing = new Map<
    string,
    { values: Set<number | null>; quantitative: boolean }
  >();
  for (const [index, row] of boardCourses(plan).entries()) {
    if (row.term !== options.targetTerm) continue;
    const code =
      row.course.subject && row.course.number
        ? `${row.course.subject} ${row.course.number}`
        : `placeholder-${index}`;
    const catalog = options.catalogCredits?.[code];
    const value = catalog
      ? catalog.min === catalog.max
        ? catalog.min
        : null
      : row.course.credits;
    const entry = existing.get(code) ?? {
      values: new Set<number | null>(),
      quantitative: quantitative.has(row.course.subject ?? ""),
    };
    entry.values.add(value);
    existing.set(code, entry);
  }
  let existingCredits = 0,
    unresolvedExisting = 0,
    existingQuantitative = 0;
  for (const entry of existing.values()) {
    if (entry.values.size === 1 && !entry.values.has(null))
      existingCredits += [...entry.values][0]!;
    else unresolvedExisting++;
    if (entry.quantitative) existingQuantitative++;
  }
  const covered = new Set(
    candidates.filter((c) => existing.has(c.key)).flatMap((c) => c.ruleIds),
  );
  let beam: State[] = [
    {
      items: [],
      credits: existingCredits,
      quant: existingQuantitative,
      covered,
      score: 0,
    },
  ];
  for (const candidate of candidates
    .filter(
      (c) =>
        !unresolvedExisting &&
        !existing.has(c.key) &&
        c.credits !== null &&
        c.credits > 0 &&
        !c.conflict &&
        (!c.sample ||
          c.sampleMatch ||
          c.planned ||
          c.ruleIds.length > 0 ||
          c.unreviewed),
    )
    .slice(0, 60)) {
    const next = [...beam];
    for (const state of beam) {
      const credits = state.credits + candidate.credits!,
        quant = state.quant + Number(quantitative.has(candidate.subject));
      if (
        credits > options.maxCredits + 0.001 ||
        quant > options.maxQuantitative
      )
        continue;
      const newRules = candidate.ruleIds.filter((id) => !state.covered.has(id));
      // No second degree-progress reward for another alternative in an already
      // represented requirement. Applicability still needs advisor review.
      const marginal =
        candidate.score -
        (candidate.ruleIds.length && !newRules.length ? 45 : 0);
      next.push({
        items: [...state.items, candidate],
        credits,
        quant,
        covered: new Set([...state.covered, ...candidate.ruleIds]),
        score: state.score + marginal,
      });
    }
    const unique = new Map<string, State>();
    for (const state of next) {
      const key = [
        state.credits,
        state.quant,
        [...state.covered].sort().join(","),
      ].join("|");
      if (!unique.has(key) || unique.get(key)!.score < state.score)
        unique.set(key, state);
    }
    beam = [...unique.values()]
      .sort((a, b) => b.score - a.score || b.credits - a.credits)
      .slice(0, 128);
  }
  const bundle = beam[0];
  return {
    candidates,
    bundle: bundle.items,
    credits: bundle.credits,
    quantitative: bundle.quant,
    existingCredits,
    unresolvedExisting,
  };
}

/** Explicit rating lookup allowlist: no personal source IDs, status or terms. */
export function ratingRequest(candidates: PlanningCandidate[], campus: string) {
  if (!["COL", "LMA", "MNS", "MRN", "NWK", "WST"].includes(campus))
    throw Error("Invalid campus");
  return {
    courses: candidates.slice(0, 24).map((c) => ({
      id: c.key,
      subject: c.subject,
      catalogNumber: c.number,
      campusCode: campus,
      instructors: [],
    })),
  };
}

export function applyRecommendationBundle(
  plan: Plan,
  items: PlanningCandidate[],
  term: string,
  id: () => string,
): Plan {
  if (!/^(Autumn|Spring|Summer)20\d{2}$/.test(term) || items.length > 24)
    throw Error("Invalid draft bundle");
  const next = structuredClone(plan);
  const document = next.documents.find((d) => d.source === "manual") ?? {
    id: id(),
    source: "manual" as const,
    pdfOrigin: "export" as const,
    auditMode: "unknown" as const,
    catalogTerm: null,
  };
  const courses = [];
  for (const c of items) {
    const existing = next.semesters
      .flatMap((s) => s.courses)
      .filter(
        (x) =>
          x.kind === "course" &&
          x.evidenceRole === "observation" &&
          x.subject === c.subject &&
          x.number === c.number,
      );
    if (
      existing.some(
        (x) => x.status === "completed" || x.status === "in-progress",
      )
    )
      continue;
    const manual =
      existing.find((x) => x.documentId === document.id) ??
      existing.find((x) => x.id);
    if (manual?.id) {
      next.schedule.placements = next.schedule.placements.filter(
        (p) => p.courseId !== manual.id,
      );
      next.schedule.placements.push({ courseId: manual.id, term });
    } else
      courses.push({
        id: id(),
        documentId: document.id,
        subject: c.subject,
        number: c.number,
        kind: "course" as const,
        evidenceRole: "observation" as const,
        credits: c.credits,
        status: "planned" as const,
        page: null,
      });
  }
  if (courses.length) {
    if (!next.documents.some((d) => d.id === document.id))
      next.documents.push(document);
    next.semesters.push({
      documentId: document.id,
      term,
      reportedCredits: null,
      creditOrigin: "unknown",
      courses,
    });
  }
  next.schedule.terms = [...new Set([...next.schedule.terms, term])].sort(
    termOrder,
  );
  next.reviewed = false;
  return planSchema.parse(next);
}

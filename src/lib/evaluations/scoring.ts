import type {
  CourseEvaluationInput,
  InstructorEvaluationSummary,
  EvaluationAggregateRow,
  EvaluationInstrument,
  EvaluationMetric,
  EvaluationTrendPoint,
} from "./types";

/** Deliberately transparent and versioned rather than an opaque ranking model. */
export const SCORING_POLICY = {
  version: "response-decay-v1" as const,
  halfLifeYears: 2,
  positiveThreshold: 4.2,
  cautionThreshold: 3.3,
  minimumResponses: 30,
  minimumRecords: 2,
  minimumTerms: 2,
  maximumAgeYears: 2,
};

const round = (value: number) => Math.round(value * 100) / 100;

/** Midpoint approximations reflect term-level granularity; no invented evaluation dates. */
export function termDecimalYear(sortKey: number) {
  const year = Math.floor(sortKey / 10);
  const season = sortKey % 10;
  return year + ({ 1: 0.3, 2: 0.55, 3: 0.85 }[season] ?? 0.5);
}

function referenceDecimalYear(now: Date) {
  const year = now.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return year + (now.getTime() - start) / (end - start);
}

export function aggregateMetric(
  rows: EvaluationAggregateRow[],
  instrument: EvaluationInstrument,
  now = new Date(),
): EvaluationMetric | null {
  const valid = rows.filter(
    (row) => row.instrument === instrument && row.responses > 0,
  );
  if (!valid.length) return null;
  let responseCount = 0;
  let invitedCount = 0;
  let ratingTotal = 0;
  let decayedRatingTotal = 0;
  let weightedResponseCount = 0;
  let sectionCount = 0;
  const terms = new Map<
    number,
    {
      label: string;
      responses: number;
      invited: number;
      rating: number;
      records: number;
    }
  >();
  const reference = referenceDecimalYear(now);
  for (const row of valid) {
    const age = Math.max(0, reference - termDecimalYear(row.term_sort_key));
    const decay = 2 ** (-age / SCORING_POLICY.halfLifeYears);
    responseCount += row.responses;
    invitedCount += row.invited;
    ratingTotal += row.weighted_rating_total;
    decayedRatingTotal += row.weighted_rating_total * decay;
    weightedResponseCount += row.responses * decay;
    sectionCount += row.records;
    const term = terms.get(row.term_sort_key) ?? {
      label: row.term,
      responses: 0,
      invited: 0,
      rating: 0,
      records: 0,
    };
    term.responses += row.responses;
    term.invited += row.invited;
    term.rating += row.weighted_rating_total;
    term.records += row.records;
    terms.set(row.term_sort_key, term);
  }
  const trend: EvaluationTrendPoint[] = [...terms]
    .sort(([a], [b]) => a - b)
    .map(([sortKey, term]) => ({
      term: term.label,
      sortKey,
      score: round(term.rating / term.responses),
      responses: term.responses,
      sections: term.records,
      responseRate: term.invited
        ? round((term.responses / term.invited) * 100)
        : null,
    }));
  const first = trend[0];
  const last = trend[trend.length - 1];
  const ageYears = Math.max(0, reference - termDecimalYear(last.sortKey));
  const score = decayedRatingTotal / weightedResponseCount;
  const enough =
    responseCount >= SCORING_POLICY.minimumResponses &&
    sectionCount >= SCORING_POLICY.minimumRecords &&
    terms.size >= SCORING_POLICY.minimumTerms &&
    weightedResponseCount >= SCORING_POLICY.minimumResponses &&
    ageYears <= SCORING_POLICY.maximumAgeYears;
  const confidence =
    enough && responseCount >= 100 && sectionCount >= 3
      ? "high"
      : enough
        ? "moderate"
        : "limited";
  const recommendation = !enough
    ? "insufficient"
    : score >= SCORING_POLICY.positiveThreshold
      ? "positive"
      : score <= SCORING_POLICY.cautionThreshold
        ? "caution"
        : "mixed";
  return {
    instrument,
    score: round(score),
    unadjustedScore: round(ratingTotal / responseCount),
    responseCount,
    invitedCount,
    responseRate: invitedCount
      ? round((responseCount / invitedCount) * 100)
      : null,
    sectionCount,
    termCount: terms.size,
    firstTerm: first.term,
    lastTerm: last.term,
    lastTermSortKey: last.sortKey,
    weightedResponseCount: round(weightedResponseCount),
    confidence,
    recommendation,
    trend,
  };
}

export function buildMetrics(rows: EvaluationAggregateRow[], now = new Date()) {
  return (["SSLE", "SEI"] as const)
    .map((instrument) => aggregateMetric(rows, instrument, now))
    .filter((metric): metric is EvaluationMetric => metric !== null)
    .sort((a, b) => b.lastTermSortKey - a.lastTermSortKey);
}

/** Names can collide or change. Only an official OSU email establishes identity. */
export function nameDotNumberFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const match = /^([a-z][a-z0-9_-]*\.\d+)@(?:buckeyemail\.)?osu\.edu$/i.exec(
    email.trim(),
  );
  return match ? match[1].toLowerCase() : null;
}

/**
 * Empty course rows mean no course history, not a failed email identity match.
 * A current official catalog email is sufficient evidence of the OSU username.
 */
export function evaluationRowsForEmail<Row extends { name_dot_number: string }>(
  email: string | null | undefined,
  rows: readonly Row[],
) {
  const nameDotNumber = nameDotNumberFromEmail(email);
  return {
    nameDotNumber,
    match: nameDotNumber ? ("exact-email" as const) : ("unmatched" as const),
    rows: nameDotNumber
      ? rows.filter(
          (row) => row.name_dot_number.toLowerCase() === nameDotNumber,
        )
      : [],
  };
}

/** Keep current teachers and historical course evidence under one official identity. */
export function buildInstructorSummaries(
  input: CourseEvaluationInput,
  rows: EvaluationAggregateRow[],
): InstructorEvaluationSummary[] {
  const instructors = new Map<
    string,
    { name: string; email: string | null; currentlyListed: boolean }
  >();
  for (const instructor of input.instructors ?? []) {
    const identity = nameDotNumberFromEmail(instructor.email);
    const key = identity ?? `${instructor.name}\0${instructor.email ?? ""}`;
    instructors.set(key, {
      name: instructor.name,
      email: instructor.email ?? null,
      currentlyListed: true,
    });
  }
  for (const row of rows) {
    const email = `${row.name_dot_number}@osu.edu`;
    const identity = nameDotNumberFromEmail(email);
    if (!identity || instructors.has(identity)) continue;
    instructors.set(identity, {
      name: `${row.first_name} ${row.last_name}`.trim(),
      email,
      currentlyListed: false,
    });
  }
  return [...instructors.values()].map((instructor) => {
    const evidence = evaluationRowsForEmail(instructor.email, rows);
    const metrics = buildMetrics(evidence.rows);
    return {
      ...instructor,
      nameDotNumber: evidence.nameDotNumber,
      match: evidence.match,
      primary: metrics[0] ?? null,
      metrics,
    };
  });
}

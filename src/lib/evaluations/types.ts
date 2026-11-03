/** OSU changed instruments in AU 2025. Scores must never be pooled across instruments. */
export type EvaluationInstrument = "SEI" | "SSLE";
export type EvaluationConfidence = "high" | "moderate" | "limited";
export type EvaluationSignal =
  "positive" | "mixed" | "caution" | "insufficient";

export interface EvaluationTrendPoint {
  term: string;
  sortKey: number;
  score: number;
  responses: number;
  sections: number;
  /** Percentage in the range 0–100, not a fraction. */
  responseRate: number | null;
}

export interface EvaluationMetric {
  instrument: EvaluationInstrument;
  /** Response-count weighted mean with a two-year time-decay half-life, scale 1–5. */
  score: number;
  /** Response-count weighted mean without time decay. */
  unadjustedScore: number;
  responseCount: number;
  invitedCount: number;
  /** Percentage in the range 0–100, not a fraction. */
  responseRate: number | null;
  /** Instructor-section evaluation records; team-taught sections can appear for each instructor. */
  sectionCount: number;
  termCount: number;
  firstTerm: string;
  lastTerm: string;
  lastTermSortKey: number;
  /** Sum of time-decayed response counts, not an inferential effective sample size. */
  weightedResponseCount: number;
  confidence: EvaluationConfidence;
  recommendation: EvaluationSignal;
  trend: EvaluationTrendPoint[];
}

export interface InstructorEvaluationSummary {
  name: string;
  email: string | null;
  nameDotNumber: string | null;
  /** Exact OSU email identity only; display names never establish a match. */
  match: "exact-email" | "unmatched";
  /** Current course only. A professor's other courses are not silently substituted. */
  primary: EvaluationMetric | null;
  metrics: EvaluationMetric[];
}

export interface EvaluationSource {
  provider: string;
  url: string;
  mode: "postgres" | "unavailable";
  importedAt: string | null;
  latestTerm: string | null;
  coverage: string | null;
}

export interface CourseEvaluationSummary {
  status: "available" | "no-data" | "unavailable";
  /** Most recent available instrument, never a blended SEI + SSLE score. */
  primary: EvaluationMetric | null;
  metrics: EvaluationMetric[];
  instructors: InstructorEvaluationSummary[];
  source: EvaluationSource;
  methodologyVersion: "response-decay-v1";
}

export interface CourseEvaluationInput {
  subject: string;
  catalogNumber: string;
  instructors?: { name: string; email?: string | null }[];
  /** COL, LMA, MNS, MRN, NWK, WST; omitted means historical data from all campuses. */
  campus?: string;
}

/** Aggregated inside SQL before data crosses into Node. */
export interface EvaluationAggregateRow {
  subject: string;
  catalog: string;
  name_dot_number: string;
  first_name: string;
  last_name: string;
  instrument: EvaluationInstrument;
  term: string;
  term_sort_key: number;
  responses: number;
  invited: number;
  weighted_rating_total: number;
  records: number;
}

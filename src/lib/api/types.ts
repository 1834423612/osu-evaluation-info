/**
 * Shared public API contracts for the OSU evaluation explorer.
 *
 * Scores from SEI and SSLE deliberately remain in separate `metrics` entries.
 * They have different underlying questions and cannot be compared as one series.
 */

export const instruments = ["SEI", "SSLE"] as const;
export type Instrument = (typeof instruments)[number];

/**
 * Result ordering is deliberately limited to this allow-list so a search
 * parameter can never become a dynamic SQL identifier.
 */
export const searchSorts = [
  "default",
  "rating_desc",
  "responses_desc",
  "sections_desc",
  "recent_desc",
] as const;
export type SearchSort = (typeof searchSorts)[number];

export const metricKinds = [
  "sei_overall_item_10",
  "ssle_mean_all_items",
] as const;
export type MetricKind = (typeof metricKinds)[number];

export type DataMode = "database" | "preview";

export interface ApiDataStatus {
  mode: DataMode;
  /** A short label suitable for a visible data-source badge. */
  label: string;
  /** The reporting window represented by this source. */
  coverage: string;
  /** Present only when the response is based on the small local preview fixture. */
  isPreview: boolean;
  /** Context that should be displayed near ratings, rather than hidden in a tooltip. */
  ratingNotice: string;
}

export interface TermCoverage {
  first: string;
  last: string;
}

/**
 * An aggregate for one instrument only. `responseWeightedRating` weights each
 * section result by the number of responses; it is not a cross-instrument rank.
 */
export interface InstrumentMetrics {
  instrument: Instrument;
  metricKind: MetricKind;
  evaluationCount: number;
  sectionCount: number;
  courseCount?: number;
  responseCount: number;
  invitedCount: number;
  responseRate: number;
  meanSectionRating: number;
  responseWeightedRating: number;
  termCoverage: TermCoverage;
}

export interface EvaluationRecord {
  evaluationId: string;
  instructorId: string;
  instructorKey: string;
  instructorName: string;
  courseKey: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  classNumber: string;
  instrument: Instrument;
  metricKind: MetricKind;
  rating: number;
  standardDeviation: number | null;
  responseCount: number;
  invitedCount: number;
  responseRate: number;
  classSizeCategory: string;
  campus: string;
  college: string;
  department: string;
  deliveryMode: string;
}

export interface InstructorSummary {
  id: string;
  key: string;
  name: string;
  firstName: string;
  lastName: string;
  metrics: InstrumentMetrics[];
  coursesTaught: number;
  departments: string[];
}

export interface CourseSummary {
  key: string;
  id?: string;
  subject: string;
  catalog: string | null;
  code: string;
  title: string;
  colleges: string[];
  departments: string[];
  instructorCount: number;
  sectionCount: number;
  metrics: InstrumentMetrics[];
}

export interface InstructorDetail extends InstructorSummary {
  title: "instructor";
  nameVariants: string[];
  evaluations: EvaluationRecord[];
  courseSummaries: CourseSummary[];
}

export interface CourseDetail extends CourseSummary {
  title: "course";
  evaluations: EvaluationRecord[];
  instructors: InstructorSummary[];
}

export interface SearchFilters {
  query?: string;
  instrument?: Instrument;
  subject?: string;
  college?: string;
  campus?: string;
  department?: string;
  deliveryMode?: string;
  classSizeCategory?: string;
  term?: string;
}

export interface SearchRequest extends SearchFilters {
  kind: "all" | "instructors" | "courses";
  limit: number;
  /** One-based page number, shared by the requested result categories. */
  page: number;
  /** Defaults to the established alphabetical order for each category. */
  sort: SearchSort;
}

export interface SearchPageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * A combined search returns independently paged instructor and course lists.
 * This keeps a course-heavy result from pushing instructors off the same page.
 */
export interface SearchPagination {
  instructors: SearchPageInfo;
  courses: SearchPageInfo;
}

export interface SearchResponse {
  dataStatus: ApiDataStatus;
  filters: SearchRequest;
  pagination: SearchPagination;
  instructors: InstructorSummary[];
  courses: CourseSummary[];
}

export interface FacetValue {
  value: string;
  label: string;
  count: number;
}

export interface FacetsResponse {
  dataStatus: ApiDataStatus;
  terms: FacetValue[];
  subjects: FacetValue[];
  colleges: FacetValue[];
  campuses: FacetValue[];
  departments: FacetValue[];
  deliveryModes: FacetValue[];
  classSizeCategories: FacetValue[];
}

export interface ComparisonTarget {
  kind: "instructor" | "course";
  key: string;
}

export interface ComparisonItem {
  target: ComparisonTarget;
  instructor?: InstructorSummary;
  course?: CourseSummary;
}

export interface ComparisonResponse {
  dataStatus: ApiDataStatus;
  items: ComparisonItem[];
  /** Requested targets that had no active, reportable record. */
  missingTargets: ComparisonTarget[];
}

export interface Repository {
  readonly dataStatus: ApiDataStatus;
  search(request: SearchRequest): Promise<SearchResponse>;
  getInstructor(key: string): Promise<InstructorDetail | null>;
  getCourse(key: string): Promise<CourseDetail | null>;
  compare(targets: ComparisonTarget[]): Promise<ComparisonResponse>;
  getFacets(filters: SearchFilters): Promise<FacetsResponse>;
}

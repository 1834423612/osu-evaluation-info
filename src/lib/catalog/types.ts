import type { CourseEvaluationSummary } from "@/lib/evaluations/types";

export type CatalogInstructor = { name: string; email: string | null };
export type CatalogMeeting = {
  days: number[]; // Monday = 0, Sunday = 6; empty means no scheduled days.
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
};
export type CatalogAttribute = {
  name: string;
  value: string;
  description: string;
};
export type CatalogFee = {
  kind: "course" | "textbook" | "other";
  amount: number | null;
  description: string;
  campusCodes: string[];
};
export type SectionAvailability = {
  source: "official-availability";
  fetchedAt: string;
  isOpen: boolean | null;
  enrollmentStatus: string;
  enrollmentCapacity: number | null;
  enrollmentTotal: number | null;
  availableSeats: number | null;
  waitlistCapacity: number | null;
  waitlistTotal: number | null;
};
export type AvailabilityState =
  "idle" | "queued" | "loading" | "ready" | "error";
export type CatalogSection = {
  id: string;
  classNumber: string;
  section: string;
  component: string;
  instructionMode: string;
  enrollmentStatus: string;
  enrollmentTotal: number | null;
  waitlistTotal: number | null;
  session: string;
  sessionCode: string;
  instructors: CatalogInstructor[];
  meetings: CatalogMeeting[];
  courseId?: string;
  courseOfferingNumber?: string;
  termCode?: string;
  campusCode?: string;
  attributes?: CatalogAttribute[];
  fees?: CatalogFee[];
  availability?: SectionAvailability;
  availabilityState?: AvailabilityState;
};
export type CatalogAvailability = {
  source: "official" | "unavailable";
  fetchedAt: string | null;
};
export type CatalogCourse = {
  availability?: CatalogAvailability;
  id: string;
  courseId?: string;
  courseIds?: string[];
  subject: string;
  subjectName: string;
  catalogNumber: string;
  title: string;
  description: string;
  creditsMin: number;
  creditsMax: number;
  campus: string;
  campusCode: string;
  term: string;
  termCode: string;
  academicCareer: string;
  academicCareers?: string[];
  attributes: string[];
  fees?: CatalogFee[];
  sections: CatalogSection[];
  sectionsPartial: boolean;
  evaluation?: CourseEvaluationSummary;
};
export type CatalogFacet = {
  slug: string;
  title: string;
  items: { value: string; label: string; count: number; selected: boolean }[];
};
export type CatalogTerm = { code: string; label: string };
export type CatalogResponse = {
  searchInfo?: {
    query: string;
    kind: "course" | "number" | "subject" | "keyword";
    interpretedQuery?: string;
    subject?: string;
    complete: boolean;
    candidateSections?: number;
    descriptionMatches?: boolean;
    conflict?: boolean;
    suggestions: import("./search-query").SearchSuggestion[];
  };
  relatedMatch?: { query: string; matchedQuery: string; subject: string };
  courses: CatalogCourse[];
  page: number;
  nextCursor: string | null;
  hasMore: boolean;
  totalItems: number; // Official hit count, or distinct mirrored sections; never a course count.
  matchedSections: number | null; // Mirror: distinct sections; official: facet hit counts.
  totalCourses: number | null; // Exact for course-code searches and complete mirror snapshots.
  totalPages: number; // Official upstream pages, or grouped mirror pages. Use nextCursor.
  capped: boolean;
  filters: CatalogFacet[];
  terms: CatalogTerm[];
  source: string;
  sourceMode?: "official" | "mirror";
  snapshotAt?: string;
  fetchedAt: string;
  evaluationStatus: "available" | "unavailable" | "partial";
};
export type CatalogSearch = {
  q?: string;
  term?: string;
  campus?: string;
  subject?: string;
  cursor?: string;
  page?: number;
  limit?: number;
  sort?: string;
  filters?: Record<string, string>;
};

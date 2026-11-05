export type RmpReview = {
  id: string;
  date: string | null;
  quality: number | null;
  difficulty: number | null;
  comment: string;
  tags: string[];
  wouldTakeAgain: boolean | null;
};

export type RmpInstructor = {
  professorId: string;
  nameDotNumber: string;
  name: string;
  profileUrl: string;
  reviewCount: number;
  recentReviewCount: number;
  recentQuality: number | null;
  recentDifficulty: number | null;
  recentQualityCount: number;
  recentDifficultyCount: number;
  latestReviewDate: string | null;
  reviews: RmpReview[];
  topTags: { tag: string; count: number }[];
};

export type CourseRmpSummary = {
  status: "available" | "no-data" | "unavailable";
  instructors: RmpInstructor[];
  requestedInstructorCount: number;
  matchedInstructorCount: number;
  recentSince: string;
  refreshedAt: string | null;
};

export type CourseRmpInput = {
  subject: string;
  catalogNumber: string;
  campus: string;
  usernames: string[];
};

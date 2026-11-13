import type { RmpReview } from "./types";
export type RmpProfile = {
  id: string;
  name: string;
  department: string;
  campuses: string[];
  username: string | null;
  officialName: string | null;
  active: boolean;
  quality: number | null;
  difficulty: number | null;
  wouldTakeAgain: number | null;
  sourceReviewCount: number;
  storedReviewCount: number;
  archivedReviewCount: number;
  updatedAt: string;
  tags: unknown;
  distribution: unknown;
};
export type RmpLibraryResult = {
  profiles: RmpProfile[];
  total: number;
  nextOffset: number | null;
};
export type RmpLibraryReview = RmpReview & {
  course: string;
  active: boolean;
};
export type RmpProfileDetail = {
  supplements: {
    key: string;
    course: string;
    comment: string;
    date: string | null;
    quality: number | null;
    difficulty: number | null;
  }[];
  profile: RmpProfile;
  courses: {
    code: string;
    count: number;
    activeCount: number;
    quality: number | null;
    difficulty: number | null;
  }[];
  reviews: RmpLibraryReview[];
  total: number;
  nextOffset: number | null;
};

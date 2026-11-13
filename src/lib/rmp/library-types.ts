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
export type RmpLibraryReview = {
  teacherReply: { comment: string; date: string | null } | null;
  id: string;
  course: string;
  date: string | null;
  quality: number | null;
  difficulty: number | null;
  comment: string;
  tags: string[];
  active: boolean;
  wouldTakeAgain: boolean | null;
  grade: string | null;
  attendance: string | null;
  textbook: string | null;
  online: boolean | null;
  forCredit: boolean | null;
  thumbsUp: number;
  thumbsDown: number;
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

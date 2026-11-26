export type RmpAdminRow = {
  sourceFingerprint?: string | null;
  recordFingerprint?: string;
  professorId: string;
  name: string;
  department: string;
  campus: string;
  token: string;
  courseKey: string | null;
  state: string;
  reason: string;
  candidates: string[];
  evidence: Record<string, unknown>;
  version: number;
  manualReason: string | null;
  evidenceUrls: string[];
  updatedAt: string;
  username: string | null;
  identityState: string;
  reviewCount: number;
};
export type RmpAdminDetail = {
  row: RmpAdminRow;
  teaching: {
    source: string;
    source_record_key: string;
    course_key: string;
    latest_term: string;
    campus_code: string;
  }[];
  reviews: {
    id: string;
    course: string;
    comment: string;
    date: string | null;
  }[];
  history: {
    id: string;
    decision: Record<string, unknown>;
    previous_decision: Record<string, unknown> | null;
    recorded_at: string;
  }[];
};
export type RmpAdminResult = {
  items: RmpAdminRow[];
  total: number;
  page: number;
  pageSize: number;
  development: boolean;
};

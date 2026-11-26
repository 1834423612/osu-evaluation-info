import type { RmpAdminDetail, RmpAdminRow } from "./admin-types.ts";
import type { AssistanceGroup } from "./assistance-types.ts";
import { rmpRecordFingerprint } from "./admin-fingerprint.ts";

// Bounds use UTF-16 code units, like Zod's max(). Never leave half an emoji
// at the boundary: PostgreSQL JSONB rejects an unpaired high surrogate.
export function clipPublicEvidence(value: unknown, limit: number): string {
  const clipped = String(value ?? "").slice(0, limit);
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
}

export function buildPublicAssistanceGroup(
  row: RmpAdminRow,
  detail: RmpAdminDetail,
  candidates: AssistanceGroup["candidates"],
): AssistanceGroup {
  const reviews = detail.reviews.slice(0, 5).map((item) => ({
    id: clipPublicEvidence(item.id, 80),
    course: clipPublicEvidence(item.course, 200),
    comment: clipPublicEvidence(item.comment, 2000),
    date: item.date == null ? null : clipPublicEvidence(item.date, 100),
  }));
  return {
    professorId: row.professorId,
    campus: row.campus as AssistanceGroup["campus"],
    token: row.token,
    name: clipPublicEvidence(row.name, 300),
    department: clipPublicEvidence(row.department, 300),
    username:
      row.username == null ? null : clipPublicEvidence(row.username, 100),
    decisionVersion: row.version,
    recordFingerprint: rmpRecordFingerprint(row),
    currentCourseKey: row.courseKey,
    candidates: candidates.slice(0, 20).map((item) => ({
      key: item.key,
      title: clipPublicEvidence(item.title, 500),
      source: item.source,
      term: item.term == null ? null : clipPublicEvidence(item.term, 40),
    })),
    teaching: detail.teaching.slice(0, 50).map((item) => ({
      source: clipPublicEvidence(item.source, 100),
      courseKey: clipPublicEvidence(item.course_key, 80),
      term: clipPublicEvidence(item.latest_term, 40),
      campus: clipPublicEvidence(item.campus_code, 20),
    })),
    reviewCount: row.reviewCount,
    reviewsSampled:
      row.reviewCount > reviews.length ||
      reviews.some(
        (review, index) => review.comment !== detail.reviews[index].comment,
      ),
    reviews,
  };
}

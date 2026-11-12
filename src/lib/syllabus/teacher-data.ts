import { nameDotNumberFromEmail } from "../evaluations/scoring.ts";
import type { CatalogInstructor } from "../catalog/types.ts";
import type {
  CourseEvaluationSummary,
  EvaluationMetric,
} from "../evaluations/types.ts";
import type { CompactDirectoryRole } from "../people/role-labels.ts";
import type { RmpInsight } from "../rmp/insights.ts";

export type SyllabusTeacherData = {
  roles?: CompactDirectoryRole[] | null;
  rmp?: RmpInsight | null;
  SEI?: EvaluationMetric | null;
  SSLE?: EvaluationMetric | null;
};
export type SyllabusTeacherMap = Record<string, SyllabusTeacherData>;
export function syllabusTeacherKey(person: CatalogInstructor) {
  return (
    nameDotNumberFromEmail(person.email) ??
    `name:${person.name.trim().toLowerCase()}`
  );
}
export function teacherOfficialMetrics(
  summary: CourseEvaluationSummary | null,
  person: CatalogInstructor,
) {
  const identity = nameDotNumberFromEmail(person.email);
  const matched = identity
    ? summary?.instructors?.find(
        (item) =>
          item.match === "exact-email" && item.nameDotNumber === identity,
      )
    : null;
  const metric = (instrument: "SEI" | "SSLE") =>
    matched?.metrics.find(
      (item) =>
        item.instrument === instrument &&
        Number.isFinite(item.score) &&
        item.score >= 1 &&
        item.score <= 5,
    ) ?? null;
  return { SEI: metric("SEI"), SSLE: metric("SSLE") };
}
export function teacherScoreTone(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) || value < 1 || value > 5
    ? "unknown"
    : value >= 4
      ? "positive"
      : value >= 3
        ? "mixed"
        : "caution";
}

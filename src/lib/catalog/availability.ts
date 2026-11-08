import type { CatalogCourse, CatalogSection } from "./types";

export const AVAILABILITY_TTL_MS = 30_000;
export const MIN_AVAILABILITY_POLL_MS = 10_000;
export const UNAVAILABLE_ENROLLMENT = {
  enrollmentStatus: "",
  enrollmentTotal: null,
  waitlistTotal: null,
} as const;

/** Snapshot and saved data can supply metadata, never enrollment availability. */
export function withoutSectionAvailability(
  section: CatalogSection,
): CatalogSection {
  return { ...section, ...UNAVAILABLE_ENROLLMENT };
}
export function withoutCourseAvailability(
  course: CatalogCourse,
): CatalogCourse {
  return {
    ...course,
    availability: { source: "unavailable", fetchedAt: null },
    sections: course.sections.map(withoutSectionAvailability),
  };
}
/** Keep a successful session read visible until another read replaces it. */
export function hasOfficialAvailability(course: CatalogCourse): boolean {
  return (
    course.availability?.source === "official" &&
    typeof course.availability.fetchedAt === "string" &&
    Number.isFinite(Date.parse(course.availability.fetchedAt))
  );
}

export function isAvailabilityFresh(
  course: CatalogCourse,
  now = Date.now(),
): boolean {
  if (!hasOfficialAvailability(course)) return false;
  const age = now - Date.parse(course.availability!.fetchedAt!);
  return Number.isFinite(age) && age >= -5000 && age < AVAILABILITY_TTL_MS;
}

/** Remove volatile fields before writing the static catalog snapshot. */
export function stripEnrollmentFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...data };
  for (const key of [
    "enrollmentStatus",
    "enrollmentTotal",
    "waitlistTotal",
    "enrollmentCapacity",
    "waitlistCapacity",
    "availableSeats",
    "seatsAvailable",
    "seatsRemaining",
  ])
    delete copy[key];
  return copy;
}

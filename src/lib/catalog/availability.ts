import type { CatalogCourse, CatalogSection } from "./types";

export const UNAVAILABLE_ENROLLMENT = {
  enrollmentStatus: "",
  enrollmentTotal: null,
  waitlistTotal: null,
} as const;

/** Snapshot and saved data can supply metadata, never enrollment availability. */
export function withoutSectionAvailability(
  section: CatalogSection,
): CatalogSection {
  return {
    ...section,
    ...UNAVAILABLE_ENROLLMENT,
    availability: undefined,
    availabilityState: "idle",
  };
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
    Number.isFinite(Date.parse(course.availability.fetchedAt)) &&
    course.sections.some(
      (section) => section.availability?.source === "official-availability",
    )
  );
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
    "availability",
    "availabilityState",
    "isOpen",
  ])
    delete copy[key];
  return copy;
}

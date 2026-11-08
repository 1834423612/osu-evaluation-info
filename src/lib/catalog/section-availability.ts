import type {
  CatalogCourse,
  CatalogSection,
  SectionAvailability,
} from "./types";

export type AvailabilityQuery = {
  courseId: string;
  courseOfferingNumber: string;
  classSection: string;
  sessionCode: string;
  termCode: string;
};

export function validAvailabilityQuery(value: AvailabilityQuery) {
  return (
    /^\d{1,10}$/.test(value.courseId) &&
    /^\d{1,5}$/.test(value.courseOfferingNumber) &&
    /^[A-Za-z0-9_-]{1,12}$/.test(value.classSection) &&
    /^[A-Za-z0-9_-]{1,8}$/.test(value.sessionCode) &&
    /^\d{4}$/.test(value.termCode)
  );
}

export function sectionAvailabilityQuery(
  section: CatalogSection,
  course: CatalogCourse,
): AvailabilityQuery | null {
  const query = {
    courseId: section.courseId || course.courseId || "",
    courseOfferingNumber: section.courseOfferingNumber || "",
    classSection: section.section,
    sessionCode: section.sessionCode,
    termCode: section.termCode || course.termCode,
  };
  return validAvailabilityQuery(query) ? query : null;
}

export function availabilityKey(query: AvailabilityQuery) {
  return new URLSearchParams(query).toString();
}

export function normalizeSectionAvailability(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): SectionAvailability {
  const result = payload as {
    status?: unknown;
    data?: { availability?: Record<string, unknown> };
  } | null;
  const data = result?.data?.availability;
  if (
    result?.status !== "success" ||
    !data ||
    (typeof data.isOpen !== "boolean" &&
      typeof data.enrollmentStatus !== "string")
  )
    throw new Error("Invalid official availability response");
  const count = (key: string) =>
    typeof data[key] === "number" &&
    Number.isSafeInteger(data[key]) &&
    (data[key] as number) >= 0
      ? (data[key] as number)
      : null;
  return {
    source: "official-availability",
    fetchedAt,
    isOpen: typeof data.isOpen === "boolean" ? data.isOpen : null,
    enrollmentStatus:
      typeof data.enrollmentStatus === "string"
        ? data.enrollmentStatus.slice(0, 60)
        : "",
    enrollmentCapacity: count("enrollmentCapacity"),
    enrollmentTotal: count("enrollmentTotal"),
    availableSeats: count("availableSeats"),
    waitlistCapacity: count("waitlistCapacity"),
    waitlistTotal: count("waitlistTotal"),
  };
}

export function isVerifiedSectionAvailability(
  value: unknown,
): value is SectionAvailability {
  if (!value || typeof value !== "object") return false;
  const data = value as SectionAvailability;
  return (
    data.source === "official-availability" &&
    Number.isFinite(Date.parse(data.fetchedAt)) &&
    [
      data.enrollmentCapacity,
      data.enrollmentTotal,
      data.availableSeats,
      data.waitlistCapacity,
      data.waitlistTotal,
    ].every(
      (count) => count === null || (Number.isSafeInteger(count) && count >= 0),
    ) &&
    (data.isOpen === null || typeof data.isOpen === "boolean") &&
    typeof data.enrollmentStatus === "string"
  );
}

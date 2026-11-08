import { isDeepStrictEqual } from "node:util";
import { stripEnrollmentFields } from "../../src/lib/catalog/availability.ts";
import { actualCount, catalogError, hitCount } from "./upstream.mjs";

function text(value, label, pattern) {
  const result =
    typeof value === "string"
      ? value.trim()
      : Number.isSafeInteger(value)
        ? String(value)
        : "";
  if (
    !result ||
    /^(?:undefined|null|nan)$/i.test(result) ||
    (pattern && !pattern.test(result))
  )
    throw catalogError(`Missing or invalid official ${label}.`);
  return result;
}
const numeric = (v, label) => text(v, label, /^\d+$/);
const key = (values) => JSON.stringify(values);
const courseKey = (c) =>
  key([c.term_code, c.course_id, c.offering_number, c.campus_code]);
const sectionKey = (s) => key([s.term_code, s.class_number]);

function add(map, id, row) {
  const previous = map.get(id);
  if (previous && !isDeepStrictEqual(previous, row))
    throw catalogError(
      `Conflicting official records for ${id}.`,
      "CATALOG_IDENTITY_CONFLICT",
    );
  map.set(id, row);
}

/** Validate the whole page before SQL; course identities follow their sections. */
export function preparePage(data, partition, page) {
  if (
    actualCount(data) !== partition.expected_sections ||
    data.totalItems >= 10_000
  )
    throw catalogError(
      `Official index changed for ${partition.partition_key}.`,
      "CATALOG_INDEX_CHANGED",
    );
  const totalPages = hitCount(data.totalPages, "page count");
  if (
    !Array.isArray(data.courses) ||
    !data.courses.length ||
    totalPages < page ||
    totalPages < 1
  )
    throw catalogError(
      "Unexpected empty or invalid official results page; checkpoint preserved.",
    );
  const courses = new Map(),
    sections = new Map();
  let hits = 0;
  for (const item of data.courses) {
    const c = item.course;
    if (
      !c ||
      typeof c !== "object" ||
      Array.isArray(c) ||
      !Array.isArray(item.sections) ||
      !item.sections.length
    )
      throw catalogError("Invalid official course/section group.");
    const subject = text(c.subject, "subject");
    const catalog = text(c.catalogNumber, "catalog number");
    if (subject.toLowerCase() !== partition.query.subject.toLowerCase())
      throw catalogError("Official result belongs to a different subject.");
    for (const s of item.sections) {
      if (!s || typeof s !== "object" || Array.isArray(s))
        throw catalogError("Invalid official section record.");
      const term = text(s.termCode, "section term", /^\d{4}$/);
      if (term !== partition.query.term)
        throw catalogError("Official result belongs to a different term.");
      const courseId = numeric(s.courseId ?? c.courseId, "course ID");
      if (courseId !== numeric(c.courseId, "course ID"))
        throw catalogError(
          "Course and section IDs disagree.",
          "CATALOG_IDENTITY_CONFLICT",
        );
      const offering = numeric(
        s.courseOfferingNumber ?? c.offeringNumber,
        "offering number",
      );
      const campus = text(
        s.secCampus ?? c.campusCode,
        "campus code",
        /^[A-Za-z0-9_-]+$/,
      ).toUpperCase();
      const row = {
        term_code: term,
        course_id: courseId,
        offering_number: offering,
        campus_code: campus,
        subject,
        catalog_number: catalog,
      };
      const metadata = {
        ...stripEnrollmentFields(c),
        courseId,
        offeringNumber: offering,
        campusCode: campus,
        subject,
        catalogNumber: catalog,
      };
      add(courses, courseKey(row), {
        ...row,
        title: typeof c.title === "string" ? c.title : "",
        description: typeof c.description === "string" ? c.description : "",
        data: metadata,
      });
      const section = {
        ...row,
        class_number: numeric(s.classNumber, "class number"),
        data: {
          ...stripEnrollmentFields(s),
          termCode: term,
          courseId,
          courseOfferingNumber: offering,
          secCampus: campus,
        },
      };
      add(sections, sectionKey(section), section);
      hits++;
    }
  }
  if (hits > 200)
    throw catalogError("Official page exceeds the 200-section page limit.");
  return {
    courses: [...courses.values()].sort((a, b) =>
      courseKey(a).localeCompare(courseKey(b)),
    ),
    sections: [...sections.values()].sort((a, b) =>
      sectionKey(a).localeCompare(sectionKey(b)),
    ),
    sectionCount: hits,
    totalPages,
  };
}

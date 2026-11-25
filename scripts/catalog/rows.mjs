import { isDeepStrictEqual } from "node:util";
import { stripEnrollmentFields } from "../../src/lib/catalog/availability.ts";
import { actualCount, catalogError, facet, hitCount } from "./upstream.mjs";

function text(value, label, pattern, details) {
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
    throw catalogError(
      `Missing or invalid official ${label}.`,
      "CATALOG_DATA_INVALID",
      {
        ...details,
        expected: pattern ? String(pattern) : `nonempty ${label}`,
        actual: value ?? null,
      },
    );
  return result;
}
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
      {
        path: "identity",
        expected: id,
        actual: "conflicting static fields for the same identity",
      },
    );
  map.set(id, row);
}

function equalField(
  actual,
  expected,
  path,
  identities,
  message = "Official identity evidence does not agree.",
) {
  if (actual !== expected)
    throw catalogError(message, "CATALOG_IDENTITY_CONFLICT", {
      ...identities,
      path,
      expected,
      actual: actual ?? null,
    });
}

/** A parent can describe a different subject/catalog than its current sections.
 * Accept the section identity only when selected facets and all explicit links agree. */
function sectionIdentity(data, c, s, query, path, identities) {
  const selected = facet(data, "subject").filter(
    (item) =>
      item.term.toLowerCase() === query.subject.toLowerCase() &&
      item.selected === true,
  );
  const title =
    selected.length === 1 && typeof selected[0].title === "string"
      ? selected[0].title.trim()
      : "";
  if (!title)
    throw catalogError(
      "Official result belongs to a different subject without selected-facet evidence.",
      "CATALOG_SUBJECT_MISMATCH",
      {
        ...identities,
        path: "filters[subject].items",
        expected: `one selected ${query.subject} facet with a title`,
        actual: selected.length,
      },
    );
  equalField(s.subject, title, `${path}.subject`, identities);
  equalField(s.subjectDesc, title, `${path}.subjectDesc`, identities);
  equalField(
    String(s.courseId ?? ""),
    String(c.courseId),
    `${path}.courseId`,
    identities,
  );
  const offering = text(s.courseOfferingNumber, "offering number", /^\d+$/, {
    ...identities,
    path: `${path}.courseOfferingNumber`,
  });
  equalField(
    s._parent,
    `${c.courseId}-${offering}-${query.term}`,
    `${path}._parent`,
    identities,
  );
  const catalogNumber = text(s.catalogNumber, "catalog number", undefined, {
    ...identities,
    path: `${path}.catalogNumber`,
  });
  equalField(
    s.secCatalogNumber,
    catalogNumber,
    `${path}.secCatalogNumber`,
    identities,
  );
  return {
    subject: query.subject.toUpperCase(),
    catalogNumber,
    subjectDesc: title,
  };
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
      {
        path: "totalItems/selected filters",
        expected: partition.expected_sections,
        actual: actualCount(data),
      },
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
  const identityResolutions = [];
  let hits = 0;
  for (const [itemIndex, item] of data.courses.entries()) {
    const c = item?.course;
    const coursePath = `courses[${itemIndex}].course`;
    const ids = {
      courseId: c?.courseId ?? null,
      classNumber: item?.sections?.[0]?.classNumber ?? null,
    };
    if (
      !c ||
      typeof c !== "object" ||
      Array.isArray(c) ||
      !Array.isArray(item.sections) ||
      !item.sections.length
    )
      throw catalogError(
        "Invalid official course/section group.",
        "CATALOG_DATA_INVALID",
        {
          ...ids,
          path: `courses[${itemIndex}]`,
          expected: "course and nonempty sections",
          actual: "invalid group",
        },
      );
    const parentSubject = text(c.subject, "subject", undefined, {
      ...ids,
      path: `${coursePath}.subject`,
    });
    const parentCatalog = text(c.catalogNumber, "catalog number", undefined, {
      ...ids,
      path: `${coursePath}.catalogNumber`,
    });
    for (const [sectionIndex, s] of item.sections.entries()) {
      const sectionPath = `courses[${itemIndex}].sections[${sectionIndex}]`;
      const identities = {
        courseId: c.courseId,
        classNumber: s?.classNumber ?? null,
      };
      const field = (value, label, name, pattern) =>
        text(value, label, pattern, {
          ...identities,
          path: `${sectionPath}.${name}`,
        });
      if (!s || typeof s !== "object" || Array.isArray(s))
        throw catalogError(
          "Invalid official section record.",
          "CATALOG_DATA_INVALID",
          {
            ...identities,
            path: sectionPath,
            expected: "section object",
            actual: s ?? null,
          },
        );
      const term = field(s.termCode, "section term", "termCode", /^\d{4}$/);
      equalField(
        term,
        partition.query.term,
        `${sectionPath}.termCode`,
        identities,
        "Official result belongs to a different term.",
      );
      const courseId = field(
        s.courseId ?? c.courseId,
        "course ID",
        "courseId",
        /^\d+$/,
      );
      equalField(
        courseId,
        text(c.courseId, "course ID", /^\d+$/, {
          ...identities,
          path: `${coursePath}.courseId`,
        }),
        `${sectionPath}.courseId`,
        identities,
        "Course and section IDs disagree.",
      );
      const offering = field(
        s.courseOfferingNumber ?? c.offeringNumber,
        "offering number",
        "courseOfferingNumber",
        /^\d+$/,
      );
      const campus = field(
        s.secCampus ?? c.campusCode,
        "campus code",
        "secCampus",
        /^[A-Za-z0-9_-]+$/,
      ).toUpperCase();
      const differs =
        parentSubject.toLowerCase() !== partition.query.subject.toLowerCase() ||
        (s.catalogNumber != null &&
          String(s.catalogNumber).trim() !== parentCatalog);
      const identity = differs
        ? sectionIdentity(data, c, s, partition.query, sectionPath, identities)
        : null;
      const subject = identity?.subject ?? parentSubject;
      const catalog = identity?.catalogNumber ?? parentCatalog;
      const provenance = identity
        ? {
            officialParentIdentity: {
              subject: parentSubject,
              catalogNumber: parentCatalog,
              subjectDesc: c.subjectDesc ?? "",
            },
            subjectDesc: identity.subjectDesc,
          }
        : {};
      if (identity)
        identityResolutions.push({
          path: coursePath,
          ...identities,
          parentSubject,
          parentCatalogNumber: parentCatalog,
          subject,
          catalogNumber: catalog,
          subjectDesc: identity.subjectDesc,
        });
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
        ...provenance,
      };
      add(courses, courseKey(row), {
        ...row,
        title: typeof c.title === "string" ? c.title : "",
        description: typeof c.description === "string" ? c.description : "",
        data: metadata,
      });
      const section = {
        ...row,
        class_number: field(
          s.classNumber,
          "class number",
          "classNumber",
          /^\d+$/,
        ),
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
    identityResolutions,
  };
}

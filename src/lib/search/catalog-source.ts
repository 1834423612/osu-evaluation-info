import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import {
  mergeCatalogCourse,
  normalizeOfficialCourse,
} from "../catalog/official-client.ts";
import type {
  CatalogCourse,
  CatalogFacet,
  CatalogResponse,
  CatalogTerm,
} from "../catalog/types";
import { CourseSearchEngine } from "./engine.ts";
import { buildSearchFacets } from "./filters.ts";
import type { SearchDocument } from "./types";

export type RawCatalogRow = {
  subject: string;
  catalog_number: string;
  campus_code: string;
  data: Record<string, unknown>;
};
export type CatalogCorpus = {
  facets: CatalogFacet[];
  engine: CourseSearchEngine;
  courses: Map<string, CatalogCourse>;
  sections: Map<string, Record<string, unknown>>;
  metadata: Map<string, Record<string, unknown>>;
  run: string;
  term: string;
  snapshotAt: string;
  terms: CatalogTerm[];
};
const key = (row: Omit<RawCatalogRow, "data">) =>
  `${row.subject}\0${row.catalog_number}\0${row.campus_code}`;
function catalogData(value: string, digest: string): Record<string, unknown> {
  const bytes = Buffer.from(value, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error("Catalog payload integrity check failed");
  const data: unknown = JSON.parse(bytes.toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid published catalog payload");
  return data as Record<string, unknown>;
}

export function buildCatalogCorpus(
  courseRows: RawCatalogRow[],
  sectionRows: RawCatalogRow[],
  snapshot: {
    run: string;
    term: string;
    snapshotAt: string;
    terms: CatalogTerm[];
  },
): CatalogCorpus {
  const parents = new Map<string, RawCatalogRow[]>(),
    alternatives = new Map<string, RawCatalogRow[]>(),
    groups = new Map<string, RawCatalogRow[]>();
  for (const row of courseRows) {
    const exact = key(row),
      broad = `${row.subject}\0${row.catalog_number}`;
    parents.set(exact, [...(parents.get(exact) ?? []), row]);
    alternatives.set(broad, [...(alternatives.get(broad) ?? []), row]);
  }
  for (const row of sectionRows) {
    const id = key(row);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  const courses = new Map<string, CatalogCourse>(),
    sections = new Map<string, Record<string, unknown>>(),
    metadata = new Map<string, Record<string, unknown>>();
  const documents: SearchDocument[] = [];
  for (const [id, rows] of groups) {
    const selected =
      parents.get(id) ??
      alternatives.get(`${rows[0].subject}\0${rows[0].catalog_number}`);
    if (!selected?.length)
      throw new Error("Published catalog has sections without metadata");
    let course: CatalogCourse | undefined;
    for (const parent of selected) {
      const data = {
        ...parent.data,
        campusCode: rows[0].campus_code,
        campus: rows[0].data.campus ?? parent.data.campus,
      };
      const next = normalizeOfficialCourse(
        { course: data, sections: rows.map((row) => row.data) },
        snapshot.term,
      );
      course = course ? mergeCatalogCourse(course, next) : next;
      metadata.set(next.id, data);
    }
    if (!course) continue;
    course.sectionsPartial = false;
    courses.set(course.id, course);
    for (const row of rows) {
      const sectionId = `${snapshot.term}-${row.data.classNumber}`;
      sections.set(sectionId, row.data);
      const parent = selected.find(
        (item) =>
          String(item.data.courseId) === String(row.data.courseId) &&
          String(item.data.offeringNumber) ===
            String(row.data.courseOfferingNumber),
      );
      if (parent) metadata.set(sectionId, parent.data);
    }
    documents.push({
      id: course.id,
      subject: course.subject,
      subjectName: course.subjectName,
      catalogNumber: course.catalogNumber,
      campusCode: course.campusCode,
      title: course.title,
      description: course.description,
      instructors: [
        ...new Set(
          course.sections.flatMap((section) =>
            section.instructors.map((instructor) => instructor.name),
          ),
        ),
      ].join(" "),
    });
  }
  const corpus: CatalogCorpus = {
    ...snapshot,
    facets: [],
    courses,
    sections,
    metadata,
    engine: new CourseSearchEngine(documents),
  };
  corpus.facets = buildSearchFacets(corpus);
  return corpus;
}

/** Published generations are immutable. No DDL or official-service proxy is involved. */
export async function loadCatalogCorpus(
  connection: Pick<PoolClient, "query">,
  snapshot: {
    run: string;
    term: string;
    snapshotAt: string;
    terms: CatalogTerm[];
  },
) {
  const courses = await connection.query<
    Omit<RawCatalogRow, "data"> & { data: string; digest: string }
  >(
    "SELECT subject,catalog_number,campus_code,encode(convert_to(data::text,'UTF8'),'base64') AS data,encode(sha256(convert_to(data::text,'UTF8')),'hex') digest FROM osu_catalog.course_snapshots WHERE last_seen_run=$1::uuid AND term_code=$2 ORDER BY subject,catalog_number,campus_code,course_id,offering_number",
    [snapshot.run, snapshot.term],
  );
  // Snapshot rows also contain repeated parent descriptions. Project only the
  // section fields used for rendering and exact filtering before transferring.
  const sections = await connection.query<
    Omit<RawCatalogRow, "data"> & { data: string; digest: string }
  >(
    `SELECT subject,catalog_number,campus_code,encode(convert_to(payload,'UTF8'),'base64') data,
    encode(sha256(convert_to(payload,'UTF8')),'hex') digest FROM (
    SELECT subject,catalog_number,campus_code,class_number,jsonb_build_object(
    'classNumber',class_number,'courseId',course_id,'courseOfferingNumber',data->'courseOfferingNumber',
    'termCode',term_code,'section',data->'section','sessionCode',data->'sessionCode',
    'sessionDescription',data->'sessionDescription','component',data->'component',
    'instructionMode',data->'instructionMode','career',data->'career','campus',data->'campus',
    'secAcademicGroup',data->'secAcademicGroup','academicGroup',data->'academicGroup',
    'catalogLevel',data->'catalogLevel','attributes',data->'attributes',
    'meetings',(SELECT jsonb_agg(jsonb_build_object('instructors',meeting->'instructors'))
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'meetings')='array' THEN data->'meetings' ELSE '[]'::jsonb END) meeting))::text payload
    FROM osu_catalog.section_snapshots WHERE last_seen_run=$1::uuid AND term_code=$2
    ) projected ORDER BY subject,catalog_number,campus_code,class_number`,
    [snapshot.run, snapshot.term],
  );
  if (!courses.rows.length || !sections.rows.length)
    throw new Error("Empty published search corpus");
  const decode = (
    row: Omit<RawCatalogRow, "data"> & { data: string; digest: string },
  ): RawCatalogRow => ({ ...row, data: catalogData(row.data, row.digest) });
  return buildCatalogCorpus(
    courses.rows.map(decode),
    sections.rows.map(decode),
    snapshot,
  );
}

/** Hydrate only the bounded visible page, not every timetable in the catalog. */
export async function hydrateSearchPage(
  connection: Pick<PoolClient, "query">,
  corpus: CatalogCorpus,
  result: CatalogResponse,
) {
  if (!result.courses.length) return result;
  const numbers = result.courses.flatMap((course) =>
    course.sections.map((section) => section.classNumber),
  );
  const rows = await connection.query<{
    class_number: string;
    data: string;
    digest: string;
  }>(
    "SELECT class_number,encode(convert_to(payload,'UTF8'),'base64') data,encode(sha256(convert_to(payload,'UTF8')),'hex') digest FROM (SELECT class_number,(data - '_parent' - 'description' - 'courseDescription' - 'courseTitle')::text payload FROM osu_catalog.section_snapshots WHERE last_seen_run=$1::uuid AND term_code=$2 AND class_number=ANY($3::text[])) projected",
    [corpus.run, corpus.term, numbers],
  );
  const full = new Map(rows.rows.map((row) => [row.class_number, row]));
  for (const course of result.courses)
    course.sections = course.sections.map((section) => {
      const encoded = full.get(section.classNumber);
      if (!encoded) throw new Error("Pinned catalog detail unavailable");
      const data = catalogData(encoded.data, encoded.digest);
      const metadata =
        corpus.metadata.get(section.id) ?? corpus.metadata.get(course.id)!;
      return normalizeOfficialCourse(
        {
          course: { ...metadata, campusCode: course.campusCode },
          sections: [data],
        },
        corpus.term,
      ).sections[0];
    });
  return result;
}

import "server-only";
import type {
  CatalogCourse,
  CatalogFacet,
  CatalogResponse,
  CatalogSearch,
  CatalogSection,
  CatalogTerm,
} from "./types";

const BASE = "https://content.osu.edu/v2/classes/";
const MAX_CACHE_ENTRIES = 48;
// Keep only in-flight requests; each new browse/search reads the current OSU feed.
const CACHE_TTL_MS = 0;
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
const fetchedTimes = new WeakMap<object, string>();
const dayNames = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
export const FILTER_KEYS = [
  "class-session",
  "academic-career",
  "gen-categories",
  "academic-program",
  "instruction-mode",
  "class-attribute",
  "class-attribute-value",
  "component",
  "catalog-number",
  "evening",
];

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object"
    ? (value as JsonObject)
    : {};
}
function list(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function str(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
function nullable(value: unknown): string | null {
  return str(value) || null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function request(path: string): Promise<unknown> {
  const key = BASE + path;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  if (saved) cache.delete(key);
  while (cache.size >= MAX_CACHE_ENTRIES)
    cache.delete(cache.keys().next().value!);
  const entry = {
    expires: Number.POSITIVE_INFINITY,
    value: Promise.resolve(null) as Promise<unknown>,
  };
  const value = (async () => {
    const response = await fetch(key, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`OSU course service returned ${response.status}.`);
    const payload = object(await response.json());
    if (!payload.data || typeof payload.data !== "object")
      throw new Error("OSU course service returned an invalid response.");
    fetchedTimes.set(payload.data as object, new Date().toISOString());
    return payload.data;
  })();
  entry.value = value;
  cache.set(key, entry);
  try {
    const result = await value;
    entry.expires = Date.now() + CACHE_TTL_MS;
    return result;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export async function getSearchableTerms(): Promise<CatalogTerm[]> {
  const payload = object(await request("searchableTermsV2"));
  const terms = list(payload.data)
    .filter((t) => t.classSearch === "Y")
    .map((t) => ({ code: str(t.strm), label: str(t.descr) }));
  if (!terms.length)
    throw new Error("OSU did not publish any searchable terms.");
  return terms.sort((a, b) => b.code.localeCompare(a.code));
}

function normalizeSection(input: JsonObject, termCode: string): CatalogSection {
  const instructors = new Map<string, { name: string; email: string | null }>();
  const meetings = list(input.meetings).map((meeting) => {
    for (const instructor of list(meeting.instructors)) {
      const name = str(instructor.displayName);
      const email = nullable(instructor.email);
      if (name) instructors.set(email ?? name, { name, email });
    }
    const location =
      str(meeting.buildingDescription) ||
      [str(meeting.facilityDescription), str(meeting.room)]
        .filter(Boolean)
        .join(" ");
    return {
      days: dayNames.flatMap((day, i) => (meeting[day] === true ? [i] : [])),
      startTime: nullable(meeting.startTime),
      endTime: nullable(meeting.endTime),
      startDate: nullable(meeting.startDate),
      endDate: nullable(meeting.endDate),
      location: location || null,
    };
  });
  return {
    id: `${termCode}-${str(input.classNumber)}`,
    classNumber: str(input.classNumber),
    section: str(input.section),
    component: str(input.component),
    instructionMode: str(input.instructionMode),
    enrollmentStatus: str(input.enrollmentStatus),
    enrollmentTotal: num(input.enrollmentTotal),
    waitlistTotal: num(input.waitlistTotal),
    session: str(input.sessionDescription),
    sessionCode: str(input.sessionCode),
    instructors: [...instructors.values()],
    meetings,
  };
}

export function normalizeOfficialCourse(
  item: JsonObject,
  requestedTerm: string,
): CatalogCourse {
  const c = object(item.course);
  const sections = list(item.sections);
  const termCode = str(sections[0]?.termCode) || requestedTerm;
  const campusCode = str(c.campusCode);
  return {
    id: `${termCode}-${str(c.subject)}-${str(c.catalogNumber)}-${campusCode}`,
    subject: str(c.subject),
    subjectName: str(c.subjectDesc),
    catalogNumber: str(c.catalogNumber),
    title: str(c.title),
    description: str(c.description),
    creditsMin: num(c.minUnits) ?? 0,
    creditsMax: num(c.maxUnits) ?? 0,
    campus: str(c.campus),
    campusCode,
    term: str(c.term),
    termCode,
    academicCareer: str(c.academicCareer),
    academicCareers: str(c.academicCareer) ? [str(c.academicCareer)] : [],
    attributes: [
      ...new Set(
        list(c.courseAttributes)
          .map((a) => str(a.description))
          .filter(Boolean),
      ),
    ],
    sections: sections.map((s) => normalizeSection(s, termCode)),
    // The official endpoint groups only the sections in this 200-hit page.
    sectionsPartial: true,
  };
}

/** Offerings are internal variants of the same term/subject/catalog/campus course. */
export function mergeCatalogCourse(
  existing: CatalogCourse,
  incoming: CatalogCourse,
): CatalogCourse {
  const sections = new Map(
    existing.sections.map((section) => [section.id, section]),
  );
  for (const section of incoming.sections) sections.set(section.id, section);
  return {
    ...existing,
    title: existing.title || incoming.title,
    description: existing.description || incoming.description,
    creditsMin: Math.min(existing.creditsMin, incoming.creditsMin),
    creditsMax: Math.max(existing.creditsMax, incoming.creditsMax),
    attributes: [...new Set([...existing.attributes, ...incoming.attributes])],
    academicCareers: [
      ...new Set(
        [
          ...(existing.academicCareers ?? [existing.academicCareer]),
          ...(incoming.academicCareers ?? [incoming.academicCareer]),
        ].filter(Boolean),
      ),
    ],
    sections: [...sections.values()],
    sectionsPartial: existing.sectionsPartial || incoming.sectionsPartial,
  };
}

export async function searchOfficialCatalog(
  input: CatalogSearch = {},
): Promise<CatalogResponse> {
  const terms = await getSearchableTerms();
  const term = input.term || terms[0].code;
  let query = input.q?.trim().slice(0, 200) ?? "";
  let subject = input.subject;
  const courseCode = query.match(
    /^([a-z][a-z-]{0,19})\s*(\d{3,5}(?:\.\d{1,3})?[a-z]{0,2})$/i,
  );
  if (
    courseCode &&
    (!subject || subject.toLowerCase() === courseCode[1].toLowerCase())
  ) {
    subject = courseCode[1];
    query = courseCode[2];
  }
  const campus = input.campus === "all" ? "" : (input.campus ?? "col");
  if (input.cursor && !/^\d{1,2}:\d{1,3}$/.test(input.cursor))
    throw new CatalogInputError("Invalid course pagination cursor.");
  const [cursorPage, cursorOffset] = (input.cursor ?? "")
    .split(":")
    .map(Number);
  const page = input.cursor ? cursorPage : (input.page ?? 1);
  const offset = input.cursor ? cursorOffset : 0;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 50 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 200
  ) {
    throw new CatalogInputError("Invalid course pagination cursor.");
  }
  const limit = Math.max(1, Math.min(24, Math.floor(input.limit ?? 12)));
  const params = new URLSearchParams({
    q: query,
    client: "class-search-ui",
    p: String(page),
    term,
  });
  if (campus) params.set("campus", campus);
  if (subject) params.set("subject", subject.toLowerCase());
  if (
    ["subject", "-subject", "catalogNumber", "-catalogNumber"].includes(
      input.sort ?? "subject",
    )
  )
    params.set("sort", input.sort ?? "subject");
  for (const key of FILTER_KEYS)
    if (input.filters?.[key]) params.set(key, input.filters[key].slice(0, 200));
  const data = object(await request(`search?${params}`));
  const groupedCourses = new Map<string, CatalogCourse>();
  for (const item of list(data.courses)) {
    const course = normalizeOfficialCourse(item, term);
    const existing = groupedCourses.get(course.id);
    groupedCourses.set(
      course.id,
      existing ? mergeCatalogCourse(existing, course) : course,
    );
  }
  const allCourses = [...groupedCourses.values()];
  const filters: CatalogFacet[] = list(data.filters).map((f) => ({
    slug: str(f.slug),
    title: str(f.title),
    items: list(f.items).map((i) => ({
      value: str(i.term),
      label: str(i.title),
      count: num(i.count) ?? 0,
      selected: i.selected === true,
    })),
  }));
  const totalItems = num(data.totalItems) ?? 0;
  const totalPages = num(data.totalPages) ?? 0;
  const end = offset + limit;
  const nextCursor =
    end < allCourses.length
      ? `${page}:${end}`
      : page < totalPages
        ? `${page + 1}:0`
        : null;
  const selectedCounts = filters.flatMap((f) =>
    f.items.filter((i) => i.selected).map((i) => i.count),
  );
  return {
    courses: allCourses.slice(offset, end),
    page,
    nextCursor,
    hasMore: nextCursor !== null,
    totalItems,
    totalPages,
    matchedSections: selectedCounts.length
      ? Math.min(...selectedCounts)
      : totalItems < 10_000
        ? totalItems
        : null,
    capped: totalItems >= 10_000,
    filters,
    terms,
    source: "https://classes.osu.edu/",
    sourceMode: "official",
    fetchedAt: fetchedTimes.get(data) ?? new Date().toISOString(),
    evaluationStatus: "unavailable",
  };
}

export class CatalogInputError extends Error {}

export function parseCatalogSearch(params: URLSearchParams): CatalogSearch {
  const limit = params.has("limit") ? Number(params.get("limit")) : 12;
  const page = params.has("page") ? Number(params.get("page")) : 1;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 24 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 50
  )
    throw new CatalogInputError("Invalid page or page size.");
  for (const key of ["term", "campus", "subject"]) {
    const value = params.get(key);
    if (value && !/^[\w.-]{1,32}$/.test(value))
      throw new CatalogInputError(`Invalid ${key}.`);
  }
  return {
    q: params.get("q") ?? "",
    term: params.get("term") ?? undefined,
    campus: params.get("campus") ?? undefined,
    subject: params.get("subject") ?? undefined,
    cursor: params.get("cursor") ?? undefined,
    page,
    limit,
    sort: params.get("sort") ?? undefined,
    filters: Object.fromEntries(
      FILTER_KEYS.flatMap((key) =>
        params.has(key) ? [[key, params.get(key)!]] : [],
      ),
    ),
  };
}

/** Exact course expansion; never mistake numeric catalog levels for exact catalog filters. */
export async function getOfficialCourse(input: {
  subject: string;
  catalog: string;
  term?: string;
  campus?: string;
}) {
  const terms = await getSearchableTerms();
  const term = input.term || terms[0].code;
  const campus = input.campus ?? "col";
  const params = new URLSearchParams({
    q: input.catalog,
    client: "class-search-ui",
    term,
    subject: input.subject.toLowerCase(),
    p: "1",
  });
  if (campus !== "all") params.set("campus", campus);
  if (/^[1-8]/.test(input.catalog))
    params.set("catalog-number", `${input.catalog[0]}xxx`);
  const startedAt = Date.now();
  let course: CatalogCourse | null = null;
  let fetchedAt = "";
  let complete = false;
  const sections = new Map<string, CatalogSection>();
  // Bound expansion work even for unusually large independent-study subjects.
  for (let page = 1; page <= 12; page++) {
    if (page > 1 && Date.now() - startedAt > 15_000) break;
    params.set("p", String(page));
    let data: JsonObject;
    try {
      data = object(await request(`search?${params}`));
    } catch (error) {
      if (page === 1) throw error;
      else break;
    }
    fetchedAt = fetchedTimes.get(data) ?? new Date().toISOString();
    for (const item of list(data.courses)) {
      const raw = object(item.course);
      if (
        str(raw.subject).toUpperCase() !== input.subject.toUpperCase() ||
        str(raw.catalogNumber).toUpperCase() !== input.catalog.toUpperCase()
      )
        continue;
      const normalized = normalizeOfficialCourse(item, term);
      course = course ? mergeCatalogCourse(course, normalized) : normalized;
      for (const section of normalized.sections)
        sections.set(section.id, section);
    }
    const totalPages = num(data.totalPages) ?? 0;
    if (page >= totalPages) {
      complete = (num(data.totalItems) ?? 0) < 10_000;
      break;
    }
  }
  if (course) {
    course.sections = [...sections.values()].sort((a, b) =>
      a.classNumber.localeCompare(b.classNumber, undefined, { numeric: true }),
    );
    course.sectionsPartial = !complete;
  }
  return {
    course,
    fetchedAt,
    complete,
    source: "https://classes.osu.edu/",
    sourceMode: "official" as const,
  };
}

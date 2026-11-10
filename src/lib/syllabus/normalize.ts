import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusQuery,
  SyllabusTerm,
} from "./types.ts";

export const SYLLABUS_ORIGIN = "https://osu.simplesyllabus.com";
export const SYLLABUS_API = `${SYLLABUS_ORIGIN}/api2/`;
export const validCode = (value: string) => /^[a-z0-9]{6,32}$/i.test(value);
export const validUuid = (value: string) =>
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

export class SyllabusError extends Error {
  kind: "invalid" | "restricted" | "unavailable" | "missing";
  constructor(
    kind: "invalid" | "restricted" | "unavailable" | "missing",
    message: string = kind,
  ) {
    super(message);
    this.kind = kind;
    this.name = "SyllabusError";
  }
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const str = (value: unknown) => (typeof value === "string" ? value : "");

export function envelope(value: unknown) {
  const data = record(value);
  if (record(data.sys).success !== true || !Array.isArray(data.items))
    throw new SyllabusError(
      "unavailable",
      "Invalid official syllabus response",
    );
  return {
    items: data.items as unknown[],
    pagination: record(data.pagination),
  };
}

/** OSU's term code uses the century, two-digit year and semester (2/4/8). */
export function termCodeFromName(value: string): string | null {
  const match = /^(Spring|Summer|Autumn|Fall)\s+(20\d{2})$/i.exec(value.trim());
  if (!match) return null;
  return `1${match[2].slice(2)}${({ spring: "2", summer: "4", autumn: "8", fall: "8" } as Record<string, string>)[match[1].toLowerCase()]}`;
}

export function normalizeTerms(value: unknown): SyllabusTerm[] {
  const state = record(record(envelope(value).items[0]).state);
  if (!Array.isArray(state.terms)) throw new SyllabusError("unavailable");
  return state.terms.flatMap((raw) => {
    const term = record(raw),
      id = str(term.entity_id),
      name = str(term.name);
    if (!validUuid(id) || !name) return [];
    return [
      {
        id,
        name,
        code: termCodeFromName(name),
        status: str(term.status),
        published: term.is_published === true,
        startsAt: str(term.start_date) || null,
        endsAt: str(term.end_date) || null,
      },
    ];
  });
}

export function normalizeEntry(value: unknown): SyllabusEntry | null {
  const raw = record(value),
    title = str(raw.title);
  const identity =
    /^([A-Z][A-Z-]{0,19})\s+(\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2})\s+([^\r\n]{1,100})$/i.exec(
      title.trim(),
    );
  const code = str(raw.code),
    entityId = str(raw.entity_id),
    termId = str(raw.term_id);
  if (
    !identity ||
    !validCode(code) ||
    !validUuid(entityId) ||
    !validUuid(termId) ||
    raw.family_name !== "syllabus" ||
    raw.entity_type !== "section"
  )
    return null;
  const termName = str(raw.term_name) || str(record(raw.term).name);
  return {
    code,
    entityId,
    termId,
    termName,
    termCode: termCodeFromName(termName),
    subject: identity[1].toUpperCase(),
    catalogNumber: identity[2].toUpperCase(),
    classNumber: /^\d{1,8}$/.test(identity[3]) ? identity[3] : "",
    sectionIdentifier: identity[3],
    title,
    subtitle: str(raw.sub_title),
    visibility: str(raw.visibility),
    hasUploads:
      raw.has_published_uploads === true ||
      (Array.isArray(raw.uploads) && raw.uploads.length > 0),
  };
}

export function normalizeLibraryPage(value: unknown, page: number) {
  const { items, pagination } = envelope(value);
  const total = Number(pagination.total),
    pageSize = Number(pagination.page_size);
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > 100_000 ||
    Number(pagination.page) !== page ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 500 ||
    Number(pagination.returned) !== items.length ||
    items.length > pageSize ||
    (!items.length && page * pageSize < total)
  )
    throw new SyllabusError("unavailable", "Invalid syllabus pagination");
  const entries = items.map(normalizeEntry);
  if (entries.some((entry) => !entry))
    throw new SyllabusError("unavailable", "Unknown syllabus identity format");
  return {
    entries: entries as SyllabusEntry[],
    total,
    pageSize,
    hasMore: (page + 1) * pageSize < total,
  };
}

export function normalizeDocument(
  value: unknown,
  expectedCode: string,
): SyllabusDocument {
  const raw = record(record(envelope(value).items[0]).doc_data);
  if (raw.is_published !== true || raw.is_working === true)
    throw new SyllabusError("missing");
  const entry = normalizeEntry(raw);
  if (!entry || entry.code !== expectedCode || !Array.isArray(raw.components))
    throw new SyllabusError(
      "unavailable",
      "Syllabus document identity mismatch",
    );
  const snapshotId = str(raw.published_snapshot_id);
  if (!validUuid(snapshotId)) throw new SyllabusError("unavailable");
  let size = 0;
  const components = raw.components
    .flatMap((item) => {
      const c = record(item),
        html = str(c.html),
        id = str(c.component_id);
      // Never expose private or draft components; choose the English variation once.
      if (
        c.is_public !== true ||
        c.snapshot_id !== snapshotId ||
        !validUuid(id) ||
        !html ||
        (c.locale !== "en-US" && c.locale != null)
      )
        return [];
      size += html.length;
      return [
        {
          id,
          html,
          type: str(c.component_type),
          order: Number(c.sort_order) || 0,
          locale: str(c.locale) || "en-US",
        },
      ];
    })
    .sort((a, b) => a.order - b.order);
  if (size > 4_000_000 || components.length > 500)
    throw new SyllabusError("unavailable", "Syllabus document is too large");
  return {
    entry,
    snapshotId,
    modifiedAt: str(raw.modified) || null,
    components: [...new Map(components.map((c) => [c.id, c])).values()],
  };
}

export function validQuery(query: SyllabusQuery) {
  return (
    /^[A-Z][A-Z-]{0,19}$/i.test(query.subject) &&
    /^\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/i.test(query.catalogNumber) &&
    /^1\d{2}[248]$/.test(query.termCode)
  );
}

export function entryMatches(
  entry: SyllabusEntry,
  query: SyllabusQuery,
  classNumbers?: readonly string[],
) {
  return (
    entry.termCode === query.termCode &&
    entry.subject === query.subject.toUpperCase() &&
    entry.catalogNumber === query.catalogNumber.toUpperCase() &&
    (!classNumbers || classNumbers.includes(entry.classNumber))
  );
}

export function officialSyllabusUrl(code?: string) {
  return code && validCode(code)
    ? `${SYLLABUS_ORIGIN}/en-US/doc/${code}`
    : `${SYLLABUS_ORIGIN}/en-US/syllabus-library`;
}

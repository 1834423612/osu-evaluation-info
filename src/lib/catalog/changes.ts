export const CHANGE_KINDS = [
  "added",
  "restored",
  "changed",
  "removed",
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export type ChangeFilters = {
  term?: string;
  campus: string;
  kind: string;
  q: string;
  days: number;
  cursor?: string;
};
export class ChangeInputError extends Error {}
export function parseChangeFilters(params: URLSearchParams): ChangeFilters {
  const term = params.get("term") || undefined,
    campus = params.get("campus") || "ALL",
    kind = params.get("kind") || "all",
    q = (params.get("q") || "").trim(),
    days = Number(params.get("days") || 30),
    cursor = params.get("cursor") || undefined;
  for (const key of ["term", "campus", "kind", "q", "days", "cursor"])
    if (params.getAll(key).length > 1)
      throw new ChangeInputError("Duplicate filter");
  if (
    (term && !/^\d{4}$/.test(term)) ||
    !["ALL", "COL", "LMA", "MNS", "MRN", "NWK", "WST"].includes(campus) ||
    ![...CHANGE_KINDS, "all"].includes(kind as ChangeKind) ||
    q.length > 80 ||
    ![7, 30, 90].includes(days) ||
    (cursor && cursor.length > 800)
  )
    throw new ChangeInputError("Invalid update filters");
  return { term, campus, kind, q, days, cursor };
}
export function changeSignature(f: ChangeFilters) {
  return JSON.stringify([f.term ?? "", f.campus, f.kind, f.q, f.days]);
}
function validInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/.test(value))
    return false;
  try {
    return (
      new Date(value).toISOString() === value.replace(/(\.\d{3})\d{3}Z$/, "$1Z")
    );
  } catch {
    return false;
  }
}
export function readChangeCursor(f: ChangeFilters) {
  if (!f.cursor) return null;
  try {
    const c = JSON.parse(Buffer.from(f.cursor, "base64url").toString());
    if (
      typeof c.id !== "string" ||
      typeof c.anchor !== "string" ||
      typeof c.time !== "string" ||
      typeof c.since !== "string" ||
      c.v !== 1 ||
      c.signature !== changeSignature(f) ||
      !/^\d{1,19}$/.test(c.id) ||
      !/^\d{1,19}$/.test(c.anchor) ||
      BigInt(c.id) > BigInt("9223372036854775807") ||
      BigInt(c.anchor) > BigInt("9223372036854775807") ||
      BigInt(c.id) > BigInt(c.anchor) ||
      !validInstant(c.time) ||
      !validInstant(c.since)
    )
      throw Error();
    return c as {
      v: 1;
      signature: string;
      id: string;
      anchor: string;
      time: string;
      since: string;
    };
  } catch {
    throw new ChangeInputError("Invalid update page. Start again.");
  }
}
export type CatalogChange = {
  id: string;
  term: string;
  courseId: string;
  offering: string;
  campus: string;
  subject: string;
  catalog: string;
  title: string;
  kind: ChangeKind;
  current: boolean;
  fields: string[];
  observedAt: string;
  beforeSections: number;
  afterSections: number;
  beforeTitle: string | null;
  beforeCredits: (string | null)[] | null;
  afterCredits: (string | null)[] | null;
};
export type ChangesResponse = {
  term: string;
  terms: { code: string; label: string; sourceStatus: string }[];
  counts: Record<ChangeKind, number>;
  items: CatalogChange[];
  nextCursor: string | null;
  latestCheck: string | null;
  comparisonSince: string | null;
  baselineSince: string | null;
  archived: boolean;
  pendingBatches: number;
};

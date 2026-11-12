import { createHash } from "node:crypto";
import { CatalogInputError } from "../catalog/official-client.ts";
import type { CatalogResponse, CatalogSearch } from "../catalog/types";
import type { CatalogCorpus } from "./catalog-source";
import { matchingSections } from "./filters.ts";
import type { SearchEvidence } from "./types";

export const SEARCH_VERSION = "bm25-1";
export function searchSignature(input: CatalogSearch) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        SEARCH_VERSION,
        input.q?.normalize("NFKC").trim().slice(0, 200),
        input.term ?? "",
        input.campus?.toUpperCase() ?? "COL",
        input.subject?.toUpperCase() ?? "",
        input.sort ?? "relevance",
        input.limit ?? 12,
        Object.entries(input.filters ?? {})
          .filter(([, value]) => value)
          .sort(),
      ]),
    )
    .digest("hex")
    .slice(0, 24);
}
export function readSearchCursor(
  input: CatalogSearch,
): { run: string; term: string; offset: number; signature: string } | null {
  if (!input.cursor) return null;
  try {
    if (!input.cursor.startsWith("s:") || input.cursor.length > 1024)
      throw new Error();
    const cursor = JSON.parse(
      Buffer.from(input.cursor.slice(2), "base64url").toString(),
    );
    if (
      !/^[\da-f-]{36}$/i.test(cursor.run) ||
      !/^\d{4}$/.test(cursor.term) ||
      !Number.isSafeInteger(cursor.offset) ||
      cursor.offset < 0 ||
      cursor.offset > 50000 ||
      cursor.signature !== searchSignature(input)
    )
      throw new Error();
    return cursor;
  } catch {
    throw new CatalogInputError(
      "Search page no longer matches the query. Start the search again.",
    );
  }
}
export function searchCorpus(
  corpus: CatalogCorpus,
  input: CatalogSearch,
): CatalogResponse {
  const cursor = readSearchCursor(input);
  if (cursor && (cursor.run !== corpus.run || cursor.term !== corpus.term))
    throw new CatalogInputError(
      "Search generation changed. Start the search again.",
    );
  const campus = (input.campus ?? "col").toUpperCase(),
    subject = input.subject?.toUpperCase();
  const scope = new Map<string, ReturnType<typeof matchingSections>>();
  for (const course of corpus.courses.values())
    if (
      (campus === "ALL" || campus === course.campusCode) &&
      (!subject || subject === course.subject)
    ) {
      const sections = matchingSections(corpus, course, input.filters);
      if (sections.length) scope.set(course.id, sections);
    }
  const found = corpus.engine.search(input.q ?? "", (doc) => scope.has(doc.id));
  if (input.sort && input.sort !== "relevance")
    found.hits.sort((a, b) => {
      const x = corpus.courses.get(a.id)!,
        y = corpus.courses.get(b.id)!;
      const numeric = input.sort?.includes("catalogNumber");
      const order = numeric
        ? x.catalogNumber.localeCompare(y.catalogNumber, "en", {
            numeric: true,
          }) || x.subject.localeCompare(y.subject)
        : x.subject.localeCompare(y.subject) ||
          x.catalogNumber.localeCompare(y.catalogNumber, "en", {
            numeric: true,
          });
      return (
        order * (input.sort?.startsWith("-") ? -1 : 1) ||
        a.id.localeCompare(b.id)
      );
    });
  const offset = cursor?.offset ?? 0,
    limit = Math.max(1, Math.min(24, input.limit ?? 12));
  const courses = found.hits.slice(offset, offset + limit).map((hit) => ({
    ...corpus.courses.get(hit.id)!,
    sections: scope.get(hit.id)!.slice(0, 24),
    sectionsPartial:
      scope.get(hit.id)!.length > 24 ||
      scope.get(hit.id)!.length < corpus.courses.get(hit.id)!.sections.length,
    searchMatch: hit.evidence,
  }));
  const sections = found.hits.reduce(
    (total, hit) => total + scope.get(hit.id)!.length,
    0,
  );
  const hasMore = offset + limit < found.hits.length;
  const nextCursor = hasMore
    ? `s:${Buffer.from(JSON.stringify({ run: corpus.run, term: corpus.term, offset: offset + limit, signature: searchSignature(input) })).toString("base64url")}`
    : null;
  const topSubject = found.subjects[0];
  const conflict = Boolean(
    subject &&
    topSubject?.score === 1 &&
    topSubject.code !== subject &&
    ["course", "subject"].includes(found.kind),
  );
  const summaries = new Map<string, SearchEvidence["corrections"][number]>();
  for (const course of courses.slice(0, 3))
    for (const correction of course.searchMatch.corrections)
      summaries.set(`${correction.from}:${correction.to}`, correction);
  const nearSubjects = found.subjects.filter(
    (item) =>
      item.score >=
      (topSubject?.score ?? 0) - (topSubject?.score === 1 ? 0 : 0.1),
  );
  const subjectChoices =
    nearSubjects.length > 1 || !courses.length ? nearSubjects : [];
  const courseChoices = [
    ...new Map(
      found.alternatives.map((hit) => {
        const doc = corpus.engine.documents.get(hit.id)!;
        return [
          `${doc.subject} ${doc.catalogNumber}`,
          {
            query: `${doc.subject} ${doc.catalogNumber}`,
            label: `${doc.subject} ${doc.catalogNumber} · ${doc.title}`,
            kind: "course" as const,
          },
        ] as const;
      }),
    ).values(),
  ].slice(0, 6);
  return {
    courses,
    hasMore,
    nextCursor,
    page: Math.floor(offset / limit) + 1,
    totalItems: sections,
    matchedSections: sections,
    totalCourses: found.hits.length,
    totalPages: Math.ceil(found.hits.length / limit),
    capped: false,
    terms: corpus.terms,
    filters: corpus.facets,
    source: "https://classes.osu.edu/",
    sourceMode: "index",
    snapshotAt: corpus.snapshotAt,
    fetchedAt: corpus.snapshotAt,
    evaluationStatus: "unavailable",
    searchInfo: {
      query: (input.q ?? "").trim().slice(0, 200),
      kind: found.kind,
      complete: true,
      subject: topSubject?.score === 1 ? topSubject.code : undefined,
      engine: SEARCH_VERSION,
      conflict,
      corrections: [...summaries.values()].slice(0, 8),
      relaxed: courses.some((course) => course.searchMatch.mode === "relaxed"),
      indexCourses: corpus.courses.size,
      suggestions: [
        ...subjectChoices.slice(0, 5).map((item) => ({
          query: (input.q ?? "").match(/\d{1,6}(?:\.\d+)?[a-z]{0,2}/i)?.[0]
            ? `${item.code} ${(input.q ?? "").match(/\d{1,6}(?:\.\d+)?[a-z]{0,2}/i)![0]}`
            : item.code,
          label: `${item.code} · ${item.label}`,
          kind: "subject" as const,
        })),
        ...courseChoices,
      ],
    },
  };
}

import { prerequisiteHeading } from "../catalog/prerequisite-heading.ts";
import { createRequestPool } from "../catalog/request-pool.ts";
import type { CatalogCourse } from "../catalog/types";
import type { PlanCourse } from "./model.ts";

export type PlanningCourseDetail = {
  course: CatalogCourse;
  sourceMode: "official" | "mirror";
  fetchedAt: string | null;
};
export type CreditRange = { min: number; max: number };
export type CourseLookup = {
  subject: string;
  number: string;
  term: string;
  campus: string;
};

export function catalogKey(query: CourseLookup) {
  return [query.subject, query.number, query.term, query.campus].join("|");
}

/** Public course identifiers only. No plan, source, program or student fields. */
export function catalogDetailUrl(query: CourseLookup) {
  if (
    !/^[A-Z][A-Z-]{0,19}$/.test(query.subject) ||
    !/^\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/.test(query.number) ||
    (query.term && !/^\d{4}$/.test(query.term)) ||
    !/^[A-Z]{2,8}$/.test(query.campus)
  )
    throw Error("Invalid course lookup");
  return (
    "/api/catalog/course?" +
    new URLSearchParams({
      subject: query.subject,
      catalog: query.number,
      term: query.term,
      campus: query.campus.toLowerCase(),
    })
  );
}

export function createPlanningCatalog(fetcher: typeof fetch) {
  const queue = createRequestPool<PlanningCourseDetail>({
    concurrency: 2,
    minStartIntervalMs: 300,
    maxQueued: 240,
    cacheMs: 10 * 60_000,
  });
  return {
    read(query: CourseLookup, signal: AbortSignal) {
      const url = catalogDetailUrl(query);
      return queue.read(
        catalogKey(query),
        async (sharedSignal) => {
          const response = await fetcher(url, {
            signal: AbortSignal.any([
              sharedSignal,
              AbortSignal.timeout(30_000),
            ]),
          });
          if (!response.ok) throw Error("Course details unavailable");
          const data = await response.json();
          const course = data.course as CatalogCourse | undefined;
          if (
            !course ||
            course.subject.toUpperCase() !== query.subject ||
            course.catalogNumber.toUpperCase() !== query.number ||
            !Number.isFinite(course.creditsMin) ||
            !Number.isFinite(course.creditsMax) ||
            course.creditsMin < 0 ||
            course.creditsMax < course.creditsMin ||
            course.creditsMax > 99
          )
            throw Error("Course details unavailable");
          return {
            course,
            sourceMode: data.sourceMode === "mirror" ? "mirror" : "official",
            fetchedAt: data.snapshotAt ?? data.fetchedAt ?? null,
          };
        },
        { signal },
      );
    },
  };
}

export function planningCredits(
  course: Pick<PlanCourse, "kind" | "credits">,
  detail?: PlanningCourseDetail,
): { range: CreditRange | null; source: "catalog" | "record" | "unknown" } {
  // An academic record's earned credits remain distinct from a planning estimate.
  if (course.kind === "course" && detail)
    return {
      range: { min: detail.course.creditsMin, max: detail.course.creditsMax },
      source: "catalog",
    };
  return {
    range:
      course.credits === null
        ? null
        : { min: course.credits, max: course.credits },
    source: course.credits === null ? "unknown" : "record",
  };
}

export function creditLabel(range: CreditRange | null) {
  if (!range) return "";
  return range.min === range.max
    ? String(range.min)
    : `${range.min}–${range.max}`;
}

/** Keep the full wording for conjunctions, grades and standing. Codes are navigation aids. */
export function prerequisiteText(description: string) {
  const heading = prerequisiteHeading(description);
  return heading ? description.slice(heading.start).trim() : null;
}

/** Only an explicit numeric "or above/higher" range permits a higher same-subject record. */
export function matchesPrerequisite(
  reference: { subject: string; number: string },
  course: Pick<PlanCourse, "subject" | "number">,
  wording: string,
) {
  if (course.subject !== reference.subject || !course.number) return false;
  if (course.number === reference.number) return true;
  const number = reference.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    new RegExp(`\\b${number}\\s+or\\s+(?:above|higher)\\b`, "i").test(
      wording,
    ) &&
    Number.isFinite(Number(course.number)) &&
    Number(course.number) >= Number(reference.number)
  );
}

/** Navigation references only. Preserve the original text for logical conditions. */
export function prerequisiteReferences(
  text: string,
  ownSubject: string,
  subjects: { code: string; title: string }[],
) {
  const aliases = new Map<string, string>();
  aliases.set(ownSubject.toLowerCase(), ownSubject);
  for (const subject of subjects)
    for (const name of [subject.code, subject.title])
      aliases.set(name.toLowerCase(), subject.code);
  const names = [...aliases.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const explicit = new RegExp(
    "(?:^|[^a-z])(" + names.join("|") + ")\\s*$",
    "i",
  );
  const prerequisites = text.split(
    /\b(?:not open|repeatability|credit for)\b/i,
  )[0];
  const references = new Map<string, { subject: string; number: string }>();
  let subject = ownSubject;
  let previousEnd = 0;
  for (const match of prerequisites.matchAll(
    /\b\d{4}(?:\.\d{1,2})?[A-Z]?\b/gi,
  )) {
    const between = prerequisites.slice(previousEnd, match.index);
    if (/\bprereq(?:uisites?)?\b/i.test(between)) subject = ownSubject;
    const prefix = between.match(explicit);
    if (prefix) subject = aliases.get(prefix[1].toLowerCase())!;
    const number = match[0].toUpperCase();
    references.set(subject + number, { subject, number });
    previousEnd = match.index + match[0].length;
  }
  return [...references.values()];
}

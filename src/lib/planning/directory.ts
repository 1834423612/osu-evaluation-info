import { z } from "zod";
import { publicUrl } from "./curriculum.ts";
const code = z
  .object({
    subject: z.string().regex(/^[A-Z][A-Z&]{1,11}$/),
    number: z.string().regex(/^\d{4}(?:\.\d{1,2})?[A-Z]?$/),
  })
  .strict();
export const documentSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{24}$/),
    url: publicUrl,
    resolvedUrl: publicUrl,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    fetchedAt: z.string().datetime({ offset: true }),
    mediaType: z.enum(["text/html", "application/pdf"]),
    title: z.string().max(240),
    programIds: z.array(z.string().regex(/^[a-f0-9]{16}$/)).max(200),
    documentKind: z.enum(["sample-plan", "requirements", "source"]),
    academicYears: z.array(z.string().regex(/^20\d{2}-20\d{2}$/)).max(100),
    effectiveTerms: z.array(z.string().regex(/^(AU|SP|SU)20\d{2}$/)).max(100),
    appliedVersions: z.array(z.string().regex(/^(AU|SP|SU)20\d{2}$/)).max(100),
    geSystems: z.array(z.enum(["GEN", "GEL"])).max(2),
    publicationStatus: z.enum(["draft", "published", "unknown"]),
    courseReferences: z.array(code).max(1000),
    pageCount: z.number().int().min(1).max(100).nullable(),
    extractionStatus: z.enum(["references", "unstructured", "unsupported"]),
    extractionIssue: z
      .enum(["page-limit", "line-limit", "parse-failed"])
      .optional(),
    reviewStatus: z.literal("pending"),
  })
  .strict();
export const directorySchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    coverage: z.literal("partial"),
    index: z
      .object({
        url: publicUrl,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        fetchedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    programs: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-f0-9]{16}$/),
            name: z.string().max(150),
            college: z.string().max(150),
            category: z.string().max(150).nullable(),
            indexUrl: publicUrl,
            documentIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)),
            coverage: z.enum(["references", "unresolved"]),
          })
          .strict(),
      )
      .max(500),
    documents: z.array(documentSchema).max(10000),
    pending: z
      .array(
        z
          .object({
            url: publicUrl,
            checkedAt: z.string().datetime({ offset: true }),
            httpStatus: z.number().int().nullable(),
            reason: z.string().max(40),
          })
          .strict(),
      )
      .max(10000),
    counts: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();
export type CurriculumDirectory = z.infer<typeof directorySchema>;
export type PublicDocument = z.infer<typeof documentSchema>;
export type DocumentSummary = Omit<PublicDocument, "courseReferences"> & {
  courseCount: number;
};
export type DirectoryResponse = ReturnType<typeof queryDirectory>;
export function queryDirectory(
  directory: CurriculumDirectory,
  input: URLSearchParams,
) {
  const q = (input.get("q") ?? "").trim().toLowerCase();
  const program = input.get("program") ?? "";
  const year = input.get("year") ?? "";
  const ge = input.get("ge") ?? "";
  const kind = input.get("kind") ?? "";
  const college = input.get("college") ?? "";
  const version = input.get("version") ?? "";
  const page = Number(input.get("page") ?? "1");
  if (version && !/^(AU|SP|SU)20\d{2}$/.test(version))
    throw Error("Invalid version");
  if (
    q.length > 100 ||
    program.length > 16 ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000 ||
    (ge && !["GEN", "GEL"].includes(ge)) ||
    (year && !/^20\d{2}-20\d{2}$/.test(year)) ||
    (kind && !["sample-plan", "requirements", "source"].includes(kind))
  )
    throw Error("Invalid filters");
  const docs = directory.documents.filter(
    (d) =>
      (!q ||
        (
          d.title +
          " " +
          d.url +
          " " +
          d.effectiveTerms.join(" ") +
          " " +
          d.appliedVersions.join(" ")
        )
          .toLowerCase()
          .includes(q)) &&
      (!program || d.programIds.includes(program)) &&
      (!college ||
        d.programIds.some((id) =>
          directory.programs.some((p) => p.id === id && p.college === college),
        )) &&
      (!year || d.academicYears.includes(year)) &&
      (!version ||
        d.effectiveTerms.includes(version) ||
        d.appliedVersions.includes(version)) &&
      (!ge || d.geSystems.includes(ge as "GEN" | "GEL")) &&
      (!kind || d.documentKind === kind),
  );
  const priority = { "sample-plan": 0, requirements: 1, source: 2 };
  docs.sort(
    (a, b) =>
      priority[a.documentKind] - priority[b.documentKind] ||
      Number(!a.courseReferences.length) - Number(!b.courseReferences.length) ||
      a.title.localeCompare(b.title),
  );
  return {
    ...directory,
    pending: undefined,
    documents: docs
      .slice((page - 1) * 24, page * 24)
      .map(({ courseReferences, ...doc }) => ({
        ...doc,
        courseCount: courseReferences.length,
      })),
    total: docs.length,
    years: [...new Set(directory.documents.flatMap((d) => d.academicYears))]
      .sort()
      .reverse(),
    versions: [
      ...new Set(
        directory.documents.flatMap((d) => [
          ...d.effectiveTerms,
          ...d.appliedVersions,
        ]),
      ),
    ]
      .sort()
      .reverse(),
    page,
  };
}

import { z } from "zod";

import {
  instruments,
  searchSorts,
  type ComparisonTarget,
  type Instrument,
  type SearchFilters,
  type SearchRequest,
} from "@/lib/api/types";

const instrumentSchema = z.enum(instruments);

const optionalText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);

const optionalCode = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);

function getParameter(searchParams: URLSearchParams, name: string) {
  const values = searchParams.getAll(name);
  if (values.length > 1) {
    throw new ApiValidationError(`Use one ${name} parameter at a time.`);
  }
  return values[0] ?? undefined;
}

export class ApiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiValidationError";
  }
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiValidationError("One or more query parameters are invalid.");
  }
  return result.data;
}

const filterSchema = z.object({
  query: optionalText,
  instrument: z
    .union([instrumentSchema, z.literal("all")])
    .optional()
    .transform((value): Instrument | undefined =>
      value && value !== "all" ? value : undefined,
    ),
  subject: optionalCode,
  college: optionalText,
  campus: optionalCode,
  department: optionalText,
  deliveryMode: optionalText,
  classSizeCategory: optionalText,
  term: optionalCode,
});

export function parseSearchFilters(
  searchParams: URLSearchParams,
): SearchFilters {
  return parseWith(filterSchema, {
    query: getParameter(searchParams, "q"),
    instrument: getParameter(searchParams, "instrument"),
    subject: getParameter(searchParams, "subject"),
    college: getParameter(searchParams, "college"),
    campus: getParameter(searchParams, "campus"),
    department: getParameter(searchParams, "department"),
    deliveryMode: getParameter(searchParams, "deliveryMode"),
    classSizeCategory: getParameter(searchParams, "classSizeCategory"),
    term: getParameter(searchParams, "term"),
  });
}

const searchSchema = filterSchema.extend({
  kind: z.enum(["all", "instructors", "courses"]).default("all"),
  limit: z.coerce.number().int().min(1).max(30).default(12),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  sort: z.enum(searchSorts).default("default"),
});

export function parseSearchRequest(
  searchParams: URLSearchParams,
): SearchRequest {
  const request = parseWith(searchSchema, {
    query: getParameter(searchParams, "q"),
    instrument: getParameter(searchParams, "instrument"),
    subject: getParameter(searchParams, "subject"),
    college: getParameter(searchParams, "college"),
    campus: getParameter(searchParams, "campus"),
    department: getParameter(searchParams, "department"),
    deliveryMode: getParameter(searchParams, "deliveryMode"),
    classSizeCategory: getParameter(searchParams, "classSizeCategory"),
    term: getParameter(searchParams, "term"),
    kind: getParameter(searchParams, "kind"),
    limit: getParameter(searchParams, "limit"),
    page: getParameter(searchParams, "page"),
    sort: getParameter(searchParams, "sort"),
  });
  if (request.sort === "rating_desc" && !request.instrument) {
    throw new ApiValidationError(
      "Choose SEI or SSLE before sorting by rating.",
    );
  }
  return request;
}

const comparisonTargetSchema = z.object({
  kind: z.enum(["instructor", "course"]),
  key: z.string().trim().min(1).max(160),
});

export function parseComparisonTargets(value: unknown): ComparisonTarget[] {
  const result = z.array(comparisonTargetSchema).min(2).max(4).safeParse(value);
  if (!result.success) {
    throw new ApiValidationError(
      "Compare two to four instructor or course records at a time.",
    );
  }

  const seen = new Set<string>();
  for (const target of result.data) {
    const identity = `${target.kind}\u0000${target.key}`;
    if (seen.has(identity)) {
      throw new ApiValidationError("Each comparison target must be unique.");
    }
    seen.add(identity);
  }

  return result.data;
}

export function parseComparisonTargetsFromSearch(
  searchParams: URLSearchParams,
): ComparisonTarget[] {
  const encoded = getParameter(searchParams, "targets");
  if (!encoded) {
    throw new ApiValidationError("The targets parameter is required.");
  }

  try {
    return parseComparisonTargets(JSON.parse(encoded));
  } catch (error) {
    if (error instanceof ApiValidationError) {
      throw error;
    }
    throw new ApiValidationError("The targets parameter must be valid JSON.");
  }
}

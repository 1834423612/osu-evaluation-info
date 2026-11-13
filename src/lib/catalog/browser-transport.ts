import { cacheBypassed } from "../debug/flags.ts";
import { debugResponse, debugFetch } from "../debug/services.ts";
import {
  createOfficialCatalogClient,
  parseCatalogSearch,
  CatalogInputError,
} from "./official-client.ts";
import {
  isOfficialEndpointPlan,
  type CatalogResource,
  type OfficialEndpointPlan,
} from "./official-endpoints.ts";
import { createRequestPool } from "./request-pool.ts";
import {
  normalizeSectionAvailability,
  validAvailabilityQuery,
  type AvailabilityQuery,
} from "./section-availability.ts";
import type { CatalogCourse, CatalogResponse } from "./types";
import type { CourseEvaluationSummary } from "../evaluations/types";

const PATHS: Record<CatalogResource, string> = {
  catalog: "/api/catalog",
  course: "/api/catalog/course",
  facets: "/api/catalog/facets",
  availability: "/api/catalog/availability",
};

function waitFor<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Discovery is cached; all uncacheable official reads originate in this browser. */
export function createCatalogTransport(
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  const plans = new Map<
    CatalogResource,
    { expires: number; promise: Promise<OfficialEndpointPlan> }
  >();
  const metadataPool = createRequestPool<unknown>({
    concurrency: 2,
    minStartIntervalMs: 250,
    maxQueued: 48,
  });
  let terms: { expires: number; body: unknown } | null = null;

  function discover(resource: CatalogResource, signal?: AbortSignal | null) {
    let cached = plans.get(resource);
    if (cacheBypassed() || !cached || cached.expires <= Date.now()) {
      const promise = (async () => {
        const response = await fetcher(PATHS[resource], {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
          throw new Error("Official endpoint discovery unavailable");
        const plan: unknown = await response.json();
        if (!isOfficialEndpointPlan(plan, resource))
          throw new Error("Invalid official endpoint configuration");
        return plan;
      })();
      const entry = { expires: Date.now() + 3_600_000, promise };
      cached = entry;
      plans.set(resource, entry);
      void promise.catch(() => {
        if (plans.get(resource) === entry) plans.delete(resource);
      });
    }
    return waitFor(cached.promise, signal);
  }

  const metadataFetch: typeof fetch = async (input, init) => {
    const url = String(input),
      isTerms = url.endsWith("/searchableTermsV2");
    if (init?.signal?.aborted) throw init.signal.reason;
    if (!cacheBypassed() && isTerms && terms && terms.expires > Date.now())
      return Response.json(terms.body);
    const body = await metadataPool.read(
      url,
      async (signal) => {
        const response = await fetcher(url, {
          ...init,
          mode: "cors",
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        });
        if (response.status === 429)
          metadataPool.backoff(
            Math.max(
              5000,
              (Number(response.headers.get("Retry-After")) || 5) * 1000,
            ),
          );
        if (!response.ok)
          throw new Error(
            `Official course service returned ${response.status}`,
          );
        const body: unknown = await response.json();
        if (isTerms && body && typeof body === "object" && "data" in body)
          terms = { body, expires: Date.now() + 30 * 60_000 };
        return body;
      },
      { signal: init?.signal ?? undefined },
    );
    return Response.json(body);
  };

  async function enrich(courses: CatalogCourse[], signal?: AbortSignal | null) {
    if (!courses.length) return;
    try {
      const response = await debugFetch(
        "evaluations",
        "/api/evaluations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
            : AbortSignal.timeout(10_000),
          body: JSON.stringify({
            courses: courses.map((c) => ({
              id: c.id,
              subject: c.subject,
              catalogNumber: c.catalogNumber,
              campusCode: c.campusCode,
              instructors: [
                ...new Map(
                  c.sections
                    .flatMap((s) => s.instructors)
                    .map((i) => [i.email ?? i.name, i]),
                ).values(),
              ].slice(0, 30),
            })),
          }),
        },
        fetcher,
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        summaries?: Record<string, CourseEvaluationSummary>;
      };
      for (const course of courses)
        course.evaluation = data.summaries?.[course.id];
    } catch (error) {
      if (signal?.aborted)
        throw error; /* Catalog information remains usable without evaluations. */
    }
  }

  const requestLive: typeof fetch = async (input, init = {}) => {
    const local = new URL(String(input), "https://catalog.invalid");
    if (local.pathname === "/api/catalog/search") {
      const response = await fetcher(local.pathname + local.search, {
        ...init,
        cache: "no-store",
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
      });
      if (!response.ok) return response;
      const result = (await response.json()) as CatalogResponse;
      if (!Array.isArray(result.courses) || result.courses.length > 24)
        throw new Error("Invalid indexed search response");
      await enrich(result.courses, init.signal);
      const available = result.courses.filter(
        (course) =>
          course.evaluation && course.evaluation.status !== "unavailable",
      ).length;
      result.evaluationStatus =
        available === result.courses.length
          ? "available"
          : available
            ? "partial"
            : "unavailable";
      return Response.json(result);
    }
    const resource = (Object.keys(PATHS) as CatalogResource[]).find(
      (key) => PATHS[key] === local.pathname,
    );
    if (!resource) throw new Error("Unsupported catalog resource");
    const signal = init.signal;
    if (resource === "availability") {
      const plan = await discover(resource, signal);
      const query = Object.fromEntries(
        [
          "courseId",
          "courseOfferingNumber",
          "classSection",
          "sessionCode",
          "termCode",
        ].map((key) => [key, local.searchParams.get(key) ?? ""]),
      ) as AvailabilityQuery;
      if (!validAvailabilityQuery(query))
        throw new CatalogInputError("Invalid availability identifiers");
      const url = new URL(plan.endpoints.availability);
      url.search = new URLSearchParams(query).toString();
      // The store owns the shared seat queue and handles Retry-After/backoff.
      const response = await fetcher(url.href, {
        ...init,
        headers: { Accept: "application/json" },
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) return response;
      return Response.json({
        availability: normalizeSectionAvailability(await response.json()),
      });
    }
    const search = parseCatalogSearch(local.searchParams);
    const snapshot = () => {
      const url = new URL(local);
      url.searchParams.set("mode", "snapshot");
      return fetcher(url.pathname + url.search, { ...init, cache: "no-store" });
    };
    let result;
    if (search.cursor?.startsWith("m:")) {
      const response = await snapshot();
      if (!response.ok) return response;
      result = await response.json();
    } else
      try {
        const plan = await discover(resource, signal);
        const client = createOfficialCatalogClient(
          plan.endpoints,
          (url, options) =>
            metadataFetch(url, {
              ...options,
              signal: signal ?? options?.signal,
            }),
        );
        if (resource === "course") {
          const subject = local.searchParams.get("subject") ?? "",
            catalog = local.searchParams.get("catalog") ?? "";
          if (
            !/^[A-Za-z][A-Za-z-]{0,19}$/.test(subject) ||
            !/^\d{3,5}(?:\.\d{1,3})?[A-Za-z]{0,2}$/.test(catalog)
          )
            throw new CatalogInputError("Invalid course identifiers");
          result = await client.getOfficialCourse({
            subject,
            catalog,
            term: search.term,
            campus: search.campus,
          });
        } else {
          const catalog = await client.searchOfficialCatalog({
            ...search,
            ...(resource === "facets" ? { limit: 1 } : {}),
          });
          result =
            resource === "facets"
              ? {
                  filters: catalog.filters,
                  terms: catalog.terms,
                  source: catalog.source,
                  fetchedAt: catalog.fetchedAt,
                }
              : catalog;
        }
      } catch (error) {
        if (signal?.aborted || error instanceof CatalogInputError) throw error;
        if (
          resource !== "course" &&
          (search.q?.trim() ||
            Object.values(search.filters ?? {}).some(Boolean))
        )
          throw error;
        const response = await snapshot();
        if (!response.ok) throw error;
        result = await response.json();
      }
    if (signal?.aborted) throw signal.reason;
    if (resource !== "facets") {
      const courses: CatalogCourse[] =
        resource === "course"
          ? result.course
            ? [result.course]
            : []
          : result.courses;
      await enrich(courses, signal);
      if (resource === "catalog") {
        const count = courses.filter(
          (c) => c.evaluation && c.evaluation.status !== "unavailable",
        ).length;
        (result as CatalogResponse).evaluationStatus =
          count === courses.length
            ? "available"
            : count
              ? "partial"
              : "unavailable";
      }
    }
    return Response.json(result);
  };
  const request: typeof fetch = (input, init) => {
    if (init?.signal?.aborted) return Promise.reject(init.signal.reason);
    const url = new URL(String(input), "https://catalog.invalid");
    const seats = url.pathname === PATHS.availability;
    return debugResponse(
      seats ? "seats" : "catalog",
      url.pathname + url.search,
      () => requestLive(input, init),
      () =>
        seats
          ? { availability: null }
          : {
              courses: [],
              course: null,
              filters: [],
              terms: [],
              page: 1,
              nextCursor: null,
              hasMore: false,
              totalItems: 0,
              matchedSections: 0,
              totalCourses: 0,
              totalPages: 0,
              capped: false,
              source: "https://classes.osu.edu/",
              sourceMode: "official",
              fetchedAt: new Date().toISOString(),
              evaluationStatus: "unavailable",
              debug: true,
            },
    );
  };
  return { request, discover };
}

export const catalogTransport = createCatalogTransport();
export const fetchCatalogResource = catalogTransport.request;

import {
  CatalogInputError,
  parseCatalogSearch,
  searchOfficialCatalog,
} from "@/lib/catalog/official";
import { canUseCatalogMirror, searchCatalogMirror } from "@/lib/catalog/mirror";
import { getCourseEvaluations } from "@/lib/evaluations/repository";
import type { CatalogResponse } from "@/lib/catalog/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const input = parseCatalogSearch(new URL(request.url).searchParams);
    const mirrorCursor = input.cursor?.startsWith("m:") ?? false;
    if (mirrorCursor && !canUseCatalogMirror(input))
      throw new CatalogInputError(
        "Snapshot cursors only support broad course browsing.",
      );
    let result: CatalogResponse;
    if (mirrorCursor) {
      const mirror = await searchCatalogMirror(input, null);
      if (!mirror)
        throw new CatalogInputError(
          "The catalog snapshot is unavailable. Start the search again or narrow the filters.",
        );
      result = mirror;
    } else {
      try {
        result = await searchOfficialCatalog(input);
      } catch (error) {
        if (error instanceof CatalogInputError || !canUseCatalogMirror(input))
          throw error;
        const mirror = await searchCatalogMirror(
          { ...input, cursor: undefined },
          null,
        );
        if (!mirror) throw error;
        result = mirror;
      }
    }
    // The evaluation contract is keyed by subject/catalog. Keep campus batches
    // separate so a regional-campus history never overwrites Columbus scores.
    const campusGroups = new Map<string, typeof result.courses>();
    for (const course of result.courses) {
      const courses = campusGroups.get(course.campusCode) ?? [];
      courses.push(course);
      campusGroups.set(course.campusCode, courses);
    }
    await Promise.all(
      [...campusGroups.values()].map(async (courses) => {
        const inputs = new Map<
          string,
          {
            subject: string;
            catalogNumber: string;
            campus: string;
            instructors: { name: string; email: string | null }[];
          }
        >();
        for (const course of courses) {
          const key = `${course.subject} ${course.catalogNumber}`;
          const input = inputs.get(key) ?? {
            subject: course.subject,
            catalogNumber: course.catalogNumber,
            campus: course.campusCode,
            instructors: [],
          };
          input.instructors.push(
            ...course.sections.flatMap((section) => section.instructors),
          );
          inputs.set(key, input);
        }
        const summaries = await getCourseEvaluations([...inputs.values()]);
        for (const course of courses)
          course.evaluation =
            summaries[`${course.subject} ${course.catalogNumber}`];
      }),
    );
    const available = result.courses.filter(
      (c) => c.evaluation && c.evaluation.status !== "unavailable",
    ).length;
    result.evaluationStatus =
      available === result.courses.length
        ? "available"
        : available
          ? "partial"
          : "unavailable";
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const invalid = error instanceof CatalogInputError;
    return Response.json(
      {
        error: invalid
          ? error.message
          : "The official OSU course service is temporarily unavailable. Please try again.",
        source: "https://classes.osu.edu/",
      },
      { status: invalid ? 400 : 502 },
    );
  }
}

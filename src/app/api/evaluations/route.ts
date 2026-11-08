import { getCourseEvaluations } from "@/lib/evaluations/repository";
import {
  parseEvaluationBatch,
  readEvaluationBatch,
} from "@/lib/evaluations/batch-input";
import type { CourseEvaluationSummary } from "@/lib/evaluations/types";

export const runtime = "nodejs";

// Local database enrichment stays on this service; catalog requests go to OSU.
export async function POST(request: Request) {
  let courses: ReturnType<typeof parseEvaluationBatch>;
  try {
    courses = await readEvaluationBatch(request);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid course batch.",
      },
      { status: 400 },
    );
  }
  const summaries: Record<string, CourseEvaluationSummary> =
    Object.create(null);
  const groups = Map.groupBy(courses, (c) => c.campusCode);
  await Promise.all(
    [...groups].map(async ([campus, group]) => {
      const result = await getCourseEvaluations(
        group.map((c) => ({ ...c, campus })),
      );
      for (const course of group)
        summaries[course.id] =
          result[`${course.subject} ${course.catalogNumber}`];
    }),
  );
  return Response.json(
    { summaries },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const subject = params.get("subject")?.trim().toUpperCase() ?? "";
  const catalogNumber = params.get("catalog")?.trim().toUpperCase() ?? "";
  const campus = params.get("campus")?.trim().toUpperCase();
  if (
    !/^[A-Z][A-Z0-9 &/-]{0,23}$/.test(subject) ||
    !/^[A-Z0-9.]{1,20}$/.test(catalogNumber)
  ) {
    return Response.json(
      { error: "Provide a valid subject and catalog number." },
      { status: 400 },
    );
  }
  if (campus && !["COL", "LMA", "MNS", "MRN", "NWK", "WST"].includes(campus)) {
    return Response.json(
      { error: "Invalid evaluation campus code." },
      { status: 400 },
    );
  }
  const instructors = params
    .getAll("email")
    .slice(0, 30)
    .map((email) => ({ name: email.split("@")[0], email }));
  const summaries = await getCourseEvaluations([
    { subject, catalogNumber, campus, instructors },
  ]);
  const summary = summaries[`${subject} ${catalogNumber}`];
  return Response.json(summary, {
    status: summary.status === "unavailable" ? 503 : 200,
    headers: {
      "Cache-Control":
        summary.status === "unavailable"
          ? "no-store"
          : "public, max-age=60, stale-while-revalidate=120",
    },
  });
}

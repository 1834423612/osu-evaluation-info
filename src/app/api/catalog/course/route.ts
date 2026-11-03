import { CatalogInputError, getOfficialCourse } from "@/lib/catalog/official";
import { getCatalogCourseMirror } from "@/lib/catalog/mirror";
import { getCourseEvaluations } from "@/lib/evaluations/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const subject = params.get("subject") ?? "";
    const catalog = params.get("catalog") ?? "";
    const term = params.get("term") ?? undefined;
    const campus = params.get("campus") ?? undefined;
    if (
      !/^[A-Za-z][A-Za-z-]{0,19}$/.test(subject) ||
      !/^\d{3,5}(?:\.\d{1,3})?[A-Za-z]{0,2}$/.test(catalog)
    )
      throw new CatalogInputError(
        "A valid subject and catalog number are required.",
      );
    if (term && !/^\d{4}$/.test(term))
      throw new CatalogInputError("Invalid term.");
    if (campus && !/^[a-zA-Z]{2,8}$/.test(campus))
      throw new CatalogInputError("Invalid campus.");
    let result:
      | Awaited<ReturnType<typeof getOfficialCourse>>
      | NonNullable<Awaited<ReturnType<typeof getCatalogCourseMirror>>>;
    try {
      result = await getOfficialCourse({ subject, catalog, term, campus });
    } catch (error) {
      const mirror = await getCatalogCourseMirror({
        subject,
        catalog,
        term,
        campus,
      });
      if (!mirror) throw error;
      result = mirror;
    }
    if (result.course) {
      const course = result.course;
      const summaries = await getCourseEvaluations([
        {
          subject: course.subject,
          catalogNumber: course.catalogNumber,
          campus: course.campusCode,
          instructors: course.sections.flatMap((s) => s.instructors),
        },
      ]);
      course.evaluation =
        summaries[`${course.subject} ${course.catalogNumber}`];
    }
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
      },
      { status: invalid ? 400 : 502 },
    );
  }
}

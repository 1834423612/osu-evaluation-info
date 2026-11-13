import { CatalogInputError } from "@/lib/catalog/official-client";
import { officialPlanResponse } from "@/lib/catalog/official-endpoints";
import { getCatalogCourseMirror } from "@/lib/catalog/mirror";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("mode") !== "snapshot") return officialPlanResponse("course");
  try {
    const subject = params.get("subject") ?? "",
      catalog = params.get("catalog") ?? "";
    const term = params.get("term") ?? undefined,
      campus = params.get("campus") ?? undefined;
    if (
      !/^[A-Za-z][A-Za-z-]{0,19}$/.test(subject) ||
      !/^\d{3,5}(?:\.\d{1,3})?[A-Za-z]{0,2}$/.test(catalog) ||
      (term && !/^\d{4}$/.test(term)) ||
      (campus && !/^[A-Za-z]{2,8}$/.test(campus))
    )
      throw new CatalogInputError("Invalid course identifiers.");
    const result = await getCatalogCourseMirror({
      subject,
      catalog,
      term,
      campus,
      includeArchived: params.get("archive") === "1",
    });
    if (!result)
      return Response.json(
        { error: "Course snapshot unavailable." },
        { status: 503 },
      );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CatalogInputError
            ? error.message
            : "Course snapshot unavailable.",
      },
      { status: error instanceof CatalogInputError ? 400 : 503 },
    );
  }
}

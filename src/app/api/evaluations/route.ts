import { getCourseEvaluations } from "@/lib/evaluations/repository";

export const runtime = "nodejs";

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

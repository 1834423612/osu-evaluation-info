import { getInstructorRmpReviews } from "@/lib/rmp/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawOffset = params.get("offset") ?? "0";
  if (!/^\d{1,5}$/.test(rawOffset))
    return Response.json({ error: "Invalid review offset." }, { status: 400 });

  try {
    const result = await getInstructorRmpReviews(
      {
        subject: params.get("subject") ?? "",
        catalogNumber: params.get("catalog") ?? "",
        campus: params.get("campus") ?? "",
        usernames: params.getAll("instructor"),
      },
      params.get("professor") ?? "",
      Number(rawOffset),
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    if (error instanceof RangeError)
      return Response.json({ error: error.message }, { status: 400 });
    return Response.json(
      { error: "RMP reviews are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

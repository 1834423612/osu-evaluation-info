import { SyllabusError, validCode, validQuery } from "@/lib/syllabus/normalize";
import {
  syllabusDocument,
  syllabusEntries,
  syllabusTerms,
} from "@/lib/syllabus/service";

export const runtime = "nodejs";

/** A fixed-origin anonymous adapter; no arbitrary URLs, cookies or credentials. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    let result;
    if (params.get("resource") === "terms")
      result = await syllabusTerms(request.signal);
    else if (params.get("resource") === "document") {
      const code = params.get("code") ?? "";
      if (!validCode(code)) throw new SyllabusError("invalid");
      result = await syllabusDocument(code, request.signal);
    } else if (params.get("resource") === "entries") {
      const query = {
        subject: params.get("subject") ?? "",
        catalogNumber: params.get("catalog") ?? "",
        termCode: params.get("term") ?? "",
      };
      if (!validQuery(query)) throw new SyllabusError("invalid");
      result = await syllabusEntries(query, request.signal);
    } else throw new SyllabusError("invalid");
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const kind = error instanceof SyllabusError ? error.kind : "unavailable";
    return Response.json(
      { error: kind },
      {
        status:
          kind === "invalid"
            ? 400
            : kind === "restricted"
              ? 403
              : kind === "missing"
                ? 404
                : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

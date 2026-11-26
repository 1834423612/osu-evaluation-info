import { queryDatabase } from "@/lib/db";
import { validCode } from "@/lib/syllabus/normalize";
import {
  compareSyllabusRevisions,
  distinctSyllabusRevisions,
} from "@/lib/syllabus/diff";
import type { SyllabusDocument } from "@/lib/syllabus/types";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams,
    code = params.get("code") ?? "",
    before = params.get("before"),
    after = params.get("after");
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (
    !validCode(code) ||
    (before !== null && !/^[a-f0-9]{64}$/.test(before)) ||
    (after !== null && !/^[a-f0-9]{64}$/.test(after)) ||
    !!before !== !!after
  )
    return Response.json({ error: "invalid" }, { status: 400, headers });
  try {
    if (before && after) {
      const result = await queryDatabase<{
        content_hash: string;
        data: SyllabusDocument;
      }>(
        `SELECT DISTINCT ON(content_hash) content_hash,data FROM osu_syllabus.document_versions WHERE code=$1 AND content_hash=ANY($2::text[]) ORDER BY content_hash,first_fetched_at DESC`,
        [code, [before, after]],
      );
      const left = result.rows.find((row) => row.content_hash === before),
        right = result.rows.find((row) => row.content_hash === after);
      if (!left || !right)
        return Response.json({ error: "missing" }, { status: 404, headers });
      return Response.json(compareSyllabusRevisions(left.data, right.data), {
        headers,
      });
    }
    const result = await queryDatabase<{
      id: string;
      data: SyllabusDocument;
      fetched_at: Date;
    }>(
      `SELECT content_hash AS id,data,first_fetched_at AS fetched_at FROM (SELECT DISTINCT ON(content_hash) content_hash,data,first_fetched_at FROM osu_syllabus.document_versions WHERE code=$1 ORDER BY content_hash,first_fetched_at DESC) revisions ORDER BY osu_syllabus.official_modified(data->>'modifiedAt') DESC NULLS LAST,first_fetched_at DESC,content_hash DESC LIMIT 90`,
      [code],
    );
    return Response.json(
      {
        versions: distinctSyllabusRevisions(
          result.rows.map((row) => ({
            id: row.id,
            document: row.data,
            fetchedAt: row.fetched_at.toISOString(),
          })),
        )
          .slice(0, 30)
          .map((row) => ({
            id: row.id,
            modifiedAt: row.document.modifiedAt,
            fetchedAt: row.fetchedAt,
            archivedCopies: row.archivedCopies,
          })),
      },
      { headers },
    );
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}

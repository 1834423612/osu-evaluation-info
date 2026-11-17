import {
  publicSamples,
  sampleReferenceReader,
} from "@/lib/planning/public-samples";
import { curriculumSchema } from "@/lib/planning/curriculum";
import { queryDirectory } from "@/lib/planning/directory";
import { loadPublicCatalog } from "@/lib/planning/catalog-database";
export const runtime = "nodejs";
export async function GET(request: Request) {
  let catalog;
  try {
    catalog = await loadPublicCatalog();
  } catch {
    return Response.json(
      { error: "Planning catalog unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { directory, curricula, subjects, sources } = catalog;
  const input = new URL(request.url).searchParams;
  const id = input.get("id");
  const headers = {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  };
  if (input.get("gallery") === "1") {
    const references = sampleReferenceReader(subjects);
    return Response.json(
      {
        samples: curricula
          .map((value) => {
            const c = curriculumSchema.parse(value);
            const source = sources.find((item) => item.url === c.source.url);
            return {
              ...c,
              college: source?.college ?? "",
              comparison:
                source && "comparison" in source ? source.comparison : null,
              downloadUrl:
                source && "downloadUrl" in source ? source.downloadUrl : null,
              semesters: c.semesters.map((semester) => ({
                ...semester,
                entries: semester.entries.map((entry) => ({
                  ...entry,
                  courses: references(entry.evidence),
                })),
              })),
            };
          })
          .filter(
            (c) =>
              c.documentKind === "sample-plan" &&
              c.semesters.length >= 8 &&
              c.semesters.every((s) => s.entries.length),
          ),
      },
      { headers },
    );
  }
  if (input.get("samples") === "1")
    return Response.json(
      {
        samples: publicSamples(
          curricula.map((c) => curriculumSchema.parse(c)),
          subjects,
        ),
      },
      { headers },
    );
  if (id) {
    const document = directory.documents.find((d) => d.id === id);
    return document
      ? Response.json(
          {
            document,
            curricula: curricula.filter((c) => c.source.url === document.url),
          },
          { headers },
        )
      : Response.json({ error: "Document not found" }, { status: 404 });
  }
  try {
    return Response.json(queryDirectory(directory, input), { headers });
  } catch {
    return Response.json(
      { error: "Invalid curriculum filters" },
      { status: 400 },
    );
  }
}

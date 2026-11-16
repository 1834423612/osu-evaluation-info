import data from "../../../../../data/planning/directory.json";
import curricula from "../../../../../data/planning/curricula.json";
import { directorySchema, queryDirectory } from "@/lib/planning/directory";
const directory = directorySchema.parse(data);
export function GET(request: Request) {
  const input = new URL(request.url).searchParams;
  const id = input.get("id");
  const headers = {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  };
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

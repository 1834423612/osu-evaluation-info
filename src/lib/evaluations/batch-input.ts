export type EvaluationBatchCourse = {
  id: string;
  subject: string;
  catalogNumber: string;
  campusCode: string;
  instructors: { name: string; email: string | null }[];
};

export function parseEvaluationBatch(value: unknown): EvaluationBatchCourse[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { courses?: unknown }).courses)
  )
    throw new Error("Invalid course batch.");
  const courses = (value as { courses: unknown[] }).courses;
  if (courses.length > 24) throw new Error("At most 24 courses per batch.");
  const identities = new Set<string>();
  return courses.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid course.");
    const c = item as EvaluationBatchCourse;
    if (
      typeof c.id !== "string" ||
      !c.id ||
      c.id.length > 160 ||
      typeof c.subject !== "string" ||
      !/^[A-Z][A-Z0-9 &/-]{0,23}$/.test(c.subject) ||
      typeof c.catalogNumber !== "string" ||
      !/^[A-Z0-9.]{1,20}$/.test(c.catalogNumber) ||
      !["COL", "LMA", "MNS", "MRN", "NWK", "WST"].includes(c.campusCode) ||
      !Array.isArray(c.instructors) ||
      c.instructors.length > 30
    )
      throw new Error("Invalid course identifiers.");
    if (identities.has(c.id)) throw new Error("Duplicate course identity.");
    identities.add(c.id);
    const instructors = c.instructors.map((i) => {
      if (
        !i ||
        typeof i.name !== "string" ||
        i.name.length > 180 ||
        (i.email !== null &&
          (typeof i.email !== "string" ||
            i.email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)))
      )
        throw new Error("Invalid instructor.");
      return { name: i.name, email: i.email };
    });
    return {
      id: c.id,
      subject: c.subject,
      catalogNumber: c.catalogNumber,
      campusCode: c.campusCode,
      instructors,
    };
  });
}

export async function readEvaluationBatch(request: Request) {
  const maxBytes = 65536;
  if (Number(request.headers.get("Content-Length")) > maxBytes)
    throw new Error("Course batch too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing course batch.");
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("Course batch too large.");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  return parseEvaluationBatch(JSON.parse(chunks.join("")));
}

import { syllabusClient } from "./client.ts";
import { documentMatchesEntry } from "./saved.ts";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusResult,
} from "./types.ts";

/** Admit at most two documents at once, even for courses with hundreds of sections. */
export async function loadSyllabusDocuments(
  entries: Pick<
    SyllabusEntry,
    "code" | "termId" | "entityId" | "classNumber"
  >[],
  signal: AbortSignal,
  onResult: (
    code: string,
    result: SyllabusResult<SyllabusDocument> | null,
  ) => void,
  fresh = false,
) {
  const queue = [
    ...new Map(entries.map((entry) => [entry.code, entry])).values(),
  ];
  async function worker() {
    while (queue.length && !signal.aborted) {
      const entry = queue.shift()!;
      try {
        const result = await syllabusClient.document(entry.code, signal, {
          fresh,
        });
        if (!documentMatchesEntry(result.data, entry as SyllabusEntry))
          throw new Error("Syllabus identity mismatch");
        if (!signal.aborted) onResult(entry.code, result);
      } catch {
        if (!signal.aborted) onResult(entry.code, null);
      }
    }
  }
  await Promise.all([worker(), worker()]);
}

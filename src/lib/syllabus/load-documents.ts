import { syllabusClient } from "./client.ts";
import { documentMatchesEntry } from "./saved.ts";
import { SyllabusError } from "./normalize.ts";
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
    error?: SyllabusError["kind"],
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
        if (!result.data.components.length) throw new SyllabusError("missing");
        if (!documentMatchesEntry(result.data, entry as SyllabusEntry))
          throw new Error("Syllabus identity mismatch");
        if (!signal.aborted) onResult(entry.code, result);
      } catch (error) {
        if (!signal.aborted)
          onResult(
            entry.code,
            null,
            error instanceof SyllabusError ? error.kind : "unavailable",
          );
      }
    }
  }
  await Promise.all([worker(), worker()]);
}

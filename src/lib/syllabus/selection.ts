import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusResult,
} from "./types.ts";
export type SyllabusDocuments = Record<
  string,
  SyllabusResult<SyllabusDocument> | null | undefined
>;

/** Wait for earlier pending entries, so response speed cannot reorder the default. */
export function selectReadableSyllabus(
  entries: SyllabusEntry[],
  documents: SyllabusDocuments,
  selected = "",
  focusClass?: string | null,
) {
  const explicit = entries.find((entry) => entry.code === selected);
  if (explicit) return explicit;
  const focused = entries.find((entry) => entry.classNumber === focusClass);
  const ordered = focused
    ? [focused, ...entries.filter((entry) => entry !== focused)]
    : entries;
  for (const entry of ordered) {
    const result = documents[entry.code];
    if (result === undefined) return undefined;
    if (result && result.data.components.length > 0) return entry;
  }
  return undefined;
}

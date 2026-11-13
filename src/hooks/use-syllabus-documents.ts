"use client";
import { useEffect, useState } from "react";
import { loadSyllabusDocuments } from "@/lib/syllabus/load-documents";
import { savedSyllabiActions } from "./use-saved-syllabi";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusResult,
} from "@/lib/syllabus/types";
const empty = {};
export function useSyllabusDocuments(entries: SyllabusEntry[]) {
  const key = JSON.stringify(
    entries.map(({ code, termId, entityId, classNumber }) => ({
      code,
      termId,
      entityId,
      classNumber,
    })),
  );
  const [state, setState] = useState<{
    key: string;
    values: Record<string, SyllabusResult<SyllabusDocument> | null>;
    missing: string[];
  }>({ key: "", values: {}, missing: [] });
  useEffect(() => {
    const controller = new AbortController();
    void loadSyllabusDocuments(
      JSON.parse(key),
      controller.signal,
      (code, result, error) => {
        if (result) savedSyllabiActions.observe(result);
        setState((previous) => ({
          key,
          missing: [
            ...(previous.key === key
              ? previous.missing.filter((id) => id !== code)
              : []),
            ...(error === "missing" ? [code] : []),
          ],
          values: {
            ...(previous.key === key ? previous.values : {}),
            [code]: result,
          },
        }));
      },
    );
    return () => controller.abort();
  }, [key]);
  return {
    documents:
      state.key === key
        ? state.values
        : (empty as Record<string, SyllabusResult<SyllabusDocument> | null>),
    missing: new Set(state.key === key ? state.missing : []),
    unavailable: new Set(
      state.key === key
        ? Object.keys(state.values).filter(
            (code) => state.values[code] === null,
          )
        : [],
    ),
  };
}

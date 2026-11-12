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
  }>({ key: "", values: {} });
  useEffect(() => {
    const controller = new AbortController();
    void loadSyllabusDocuments(
      JSON.parse(key),
      controller.signal,
      (code, result) => {
        if (result) savedSyllabiActions.observe(result);
        setState((previous) => ({
          key,
          values: {
            ...(previous.key === key ? previous.values : {}),
            [code]: result,
          },
        }));
      },
    );
    return () => controller.abort();
  }, [key]);
  return state.key === key
    ? state.values
    : (empty as Record<string, SyllabusResult<SyllabusDocument> | null>);
}

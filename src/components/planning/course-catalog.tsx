"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { searchCatalogWithRelated } from "@/lib/catalog/search-client";
import { readCourseFamilyCandidates } from "@/lib/planning/requirement-search";
import type { CatalogCourse } from "@/lib/catalog/types";
import { fetchCatalogResource } from "@/lib/catalog/browser-transport";
import {
  createPlanningCatalog,
  type PlanningCourseDetail,
} from "@/lib/planning/course-catalog";

const CatalogContext = createContext<{
  reader: ReturnType<typeof createPlanningCatalog>;
  campus: string;
  term: string;
} | null>(null);

export function PlanningCatalogProvider({
  campus,
  term,
  children,
}: {
  campus: string;
  term: string;
  children: React.ReactNode;
}) {
  const parent = useContext(CatalogContext);
  const [localReader] = useState(() =>
    createPlanningCatalog(fetchCatalogResource),
  );
  const reader = parent?.reader ?? localReader;
  const value = useMemo(
    () => ({ reader, campus, term }),
    [reader, campus, term],
  );
  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function usePlanningCourse(
  subject: string | null,
  number: string | null,
  familyFallback = false,
) {
  const context = useContext(CatalogContext);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    detail?: PlanningCourseDetail;
    variants?: CatalogCourse[];
    variantError?: string;
    status: "loading" | "ready" | "error";
  } | null>(null);
  const key = context
    ? [subject, number, context.campus, context.term].join("|")
    : "";
  useEffect(() => {
    if (!context || !subject || !number) return;
    const controller = new AbortController();
    context.reader
      .read(
        { subject, number, campus: context.campus, term: context.term },
        controller.signal,
      )
      .then((detail) => {
        if (!controller.signal.aborted)
          setState({ key, detail, status: "ready" });
      })
      .catch(async () => {
        let variants: CatalogCourse[] = [];
        let variantError = "";
        if (
          !controller.signal.aborted &&
          familyFallback &&
          /^\d{3,5}$/.test(number)
        ) {
          try {
            variants = await readCourseFamilyCandidates(
              { subject, number, campus: context.campus, term: context.term },
              searchCatalogWithRelated,
              controller.signal,
            );
          } catch (error) {
            if (!controller.signal.aborted)
              variantError =
                error instanceof Error
                  ? error.message
                  : "Course variants are unavailable.";
          }
        }
        if (!controller.signal.aborted)
          setState({ key, status: "error", variants, variantError });
      });
    return () => controller.abort();
  }, [context, subject, number, key, attempt, familyFallback]);
  return {
    detail: state?.key === key ? state.detail : undefined,
    variants: state?.key === key ? (state.variants ?? []) : [],
    variantError: state?.key === key ? state.variantError : undefined,
    status:
      !context || !subject || !number
        ? "idle"
        : state?.key === key
          ? state.status
          : "loading",
    retry() {
      setState(null);
      setAttempt((value) => value + 1);
    },
  };
}

export function usePlanningCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw Error("Planning catalog provider is required");
  return context;
}

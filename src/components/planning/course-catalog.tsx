"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
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
  const [reader] = useState(() => createPlanningCatalog(fetchCatalogResource));
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
) {
  const context = useContext(CatalogContext);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    detail?: PlanningCourseDetail;
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
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, status: "error" });
      });
    return () => controller.abort();
  }, [context, subject, number, key, attempt]);
  return {
    detail: state?.key === key ? state.detail : undefined,
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

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDetailRefresh,
  type CourseDetailState,
} from "@/lib/catalog/detail-refresh";
import type { CatalogCourse } from "@/lib/catalog/types";

export function useCourseDetails(course: CatalogCourse, open: boolean) {
  const [state, setState] = useState<CourseDetailState>({
    course: null,
    source: null,
    loading: false,
    error: false,
  });
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const { subject, catalogNumber, termCode, campusCode, id } = course;
  const courseRef = useRef(course);
  useEffect(() => {
    courseRef.current = course;
  }, [course]);
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams({
      subject,
      catalog: catalogNumber,
      term: termCode,
      campus: campusCode.toLowerCase(),
    });
    const updater = createDetailRefresh({
      course: courseRef.current,
      url: `/api/catalog/course?${params}`,
      onUpdate: setState,
    });
    refreshRef.current = updater.refresh;
    updater.start();
    return () => {
      refreshRef.current = null;
      updater.stop();
    };
  }, [open, subject, catalogNumber, termCode, campusCode, id]);
  const refresh = useCallback(() => refreshRef.current?.(), []);
  return { ...state, refresh };
}

"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePreferences } from "@/hooks/use-preferences";
import { courseSnapshotSchema } from "@/lib/saved/exchange";
import type { CatalogCourse } from "@/lib/catalog/types";
import { CourseCard } from "./course-card";
export function SharedCourseFallback({
  courses,
}: {
  courses: CatalogCourse[];
}) {
  const params = useSearchParams(),
    via = params.get("via"),
    id = params.get("course");
  const present = courses.some((c) => c.id === id);
  const [snapshot, setSnapshot] = useState<{
    id: string;
    course: CatalogCourse;
  } | null>(null);
  const {
    locale,
    saved,
    toggleSaved,
    enrollmentWatch,
    enrollmentWatchInterval,
    setEnrollmentWatch,
    setEnrollmentWatchInterval,
  } = usePreferences();
  useEffect(() => {
    if (present || !id || !via || !/^[a-f0-9-]{36}$/i.test(via)) return;
    const c = new AbortController();
    void fetch("/api/page-links/" + encodeURIComponent(via), {
      signal: c.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        const course = courseSnapshotSchema.parse(data.course);
        if (!c.signal.aborted && course.id === id) setSnapshot({ id, course });
      })
      .catch(() => {});
    return () => c.abort();
  }, [present, id, via]);
  if (present || !snapshot || snapshot.id !== id) return null;
  return (
    <div data-shared-course-fallback style={{ display: "none" }}>
      <CourseCard
        course={snapshot.course}
        locale={locale}
        saved={saved.some((x) => x.id === id)}
        onSave={toggleSaved}
        enrollmentWatch={enrollmentWatch}
        enrollmentWatchInterval={enrollmentWatchInterval}
        onEnrollmentWatchChange={setEnrollmentWatch}
        onEnrollmentWatchIntervalChange={setEnrollmentWatchInterval}
      />
    </div>
  );
}

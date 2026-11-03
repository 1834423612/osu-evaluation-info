import { Suspense } from "react";
import { CourseExplorer } from "@/components/catalog/course-explorer";

export default function HomePage() {
  return (
    <Suspense>
      <CourseExplorer />
    </Suspense>
  );
}

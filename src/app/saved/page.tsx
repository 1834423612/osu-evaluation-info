import type { Metadata } from "next";
import { SavedCourses } from "@/components/saved/saved-courses";

export const metadata: Metadata = {
  title: "Saved courses",
  description:
    "Revisit the Ohio State courses you saved with Course Atlas. Your shortlist stays on this device.",
};

export default function SavedPage() {
  return <SavedCourses />;
}

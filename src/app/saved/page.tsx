import type { Metadata } from "next";
import { SavedCourses } from "@/components/saved/saved-courses";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Saved courses",
  description: `Revisit the Ohio State courses you saved with ${brand.name}. Your shortlist stays on this device.`,
};

export default function SavedPage() {
  return <SavedCourses />;
}

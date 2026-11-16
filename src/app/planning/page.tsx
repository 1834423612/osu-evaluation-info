import type { Metadata } from "next";
import { PlanningWorkspace } from "@/components/planning/planning-workspace";
export const metadata: Metadata = {
  title: "Schedule planning",
  robots: { index: false, follow: false },
};
export default function PlanningPage() {
  return <PlanningWorkspace />;
}

import type { Metadata } from "next";
import { Methodology } from "@/components/evaluations/methodology";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Evaluation methodology",
  description: `Understand how ${brand.name} presents Ohio State teaching evaluations, matches instructors, and keeps rating sources distinct.`,
};

export default function MethodologyPage() {
  return <Methodology />;
}

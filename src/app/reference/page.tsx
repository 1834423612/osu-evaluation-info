import type { Metadata } from "next";
import { ReferencePage } from "@/components/reference/reference-page";
export const metadata: Metadata = {
  title: "OSU class and evaluation reference",
  description:
    "Official OSU instruction modes, class components, SEI and SSLE question summaries, scales, and scoring explanations.",
};
export default function Page() {
  return <ReferencePage />;
}

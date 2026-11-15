import { DiagnosticsPage } from "@/components/diagnostics/diagnostics-page";
export const metadata = {
  title: "Browser diagnostics",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <DiagnosticsPage />;
}

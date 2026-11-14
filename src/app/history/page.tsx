import { HistoryPage } from "@/components/history/history-page";
export const metadata = {
  title: "Recent activity",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <HistoryPage />;
}

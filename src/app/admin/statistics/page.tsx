import { StatisticsPage } from "@/components/admin/statistics-page";
export const metadata = {
  title: "Site statistics",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <StatisticsPage />;
}

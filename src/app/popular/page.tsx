import { Suspense } from "react";
import { PopularPage } from "@/components/catalog/popular-page";
export const metadata = { title: "Discover courses" };
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PopularPage />
    </Suspense>
  );
}

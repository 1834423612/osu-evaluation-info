import type { Metadata } from "next";
import { CatalogUpdates } from "@/components/catalog/catalog-updates";
export const metadata: Metadata = {
  title: "Course updates",
  description: "Observed additions and changes in Ohio State class offerings.",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    params = new URLSearchParams();
  for (const key of ["term", "campus", "kind", "q", "days", "cursor"]) {
    const value = raw[key];
    if (typeof value === "string") params.set(key, value);
  }
  return <CatalogUpdates query={params.toString()} />;
}

import type { Metadata } from "next";
import { RmpLibrary } from "@/components/rmp/rmp-library";
import { parseRmpLibraryInput } from "@/lib/rmp/library-input";
export const metadata: Metadata = {
  title: "RMP faculty library",
  description: "Saved RMP profiles and reviews across all Ohio State campuses.",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "campus", "identity", "offset"]) {
    const value = raw[key];
    if (typeof value === "string") params.set(key, value);
  }
  let input;
  try {
    input = parseRmpLibraryInput(params);
  } catch {
    input = parseRmpLibraryInput(new URLSearchParams());
  }
  return <RmpLibrary {...input} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RmpProfilePage } from "@/components/rmp/rmp-profile";
import { rmpProfessorId } from "@/lib/rmp/library-input";
import { parseReviewOffset } from "@/lib/rmp/pagination";
export const metadata: Metadata = { title: "RMP professor reviews" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  try {
    rmpProfessorId(id);
  } catch {
    notFound();
  }
  const raw = await searchParams;
  const course =
    typeof raw.course === "string" && raw.course.length <= 100
      ? raw.course
      : null;
  let offset = 0;
  try {
    offset = parseReviewOffset(
      typeof raw.offset === "string" ? raw.offset : "0",
    );
  } catch {}
  return <RmpProfilePage id={id} course={course} offset={offset} />;
}

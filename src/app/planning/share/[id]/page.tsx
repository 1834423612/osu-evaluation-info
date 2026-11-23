import { SharedPlan } from "@/components/planning/shared-plan";
export const metadata = {
  title: "Shared semester plan",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SharedPlan key={id} id={id} />;
}

import { RmpAdminPage } from "@/components/admin/rmp-admin-page";
import { adminFiltersSchema } from "@/lib/rmp/admin-input";
export const metadata = {
  title: "RMP reconciliation",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parsed = adminFiltersSchema.safeParse(await searchParams);
  return (
    <RmpAdminPage
      initialFilters={
        parsed.success ? parsed.data : adminFiltersSchema.parse({})
      }
    />
  );
}

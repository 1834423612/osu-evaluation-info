import { AdminUsersPage } from "@/components/admin/admin-users-page";
export const metadata = {
  title: "Accounts & permissions",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AdminUsersPage />;
}

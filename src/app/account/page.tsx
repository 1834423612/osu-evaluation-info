import { AccountPage } from "@/components/account/account-page";
export const metadata = {
  title: "Account & devices",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <AccountPage />;
}

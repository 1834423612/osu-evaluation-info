import { TransferPage } from "@/components/transfer/transfer-page";
export const metadata = {
  title: "Receive favorites",
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TransferPage key={id} id={id} />;
}

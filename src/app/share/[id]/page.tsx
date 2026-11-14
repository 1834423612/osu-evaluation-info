import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { SharedPage } from "@/components/sharing/shared-page";
import {
  readShare,
  recordShareEvent,
  shareIdSchema,
} from "@/lib/user-data/sharing";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let title = "Shared collection",
    description = "Open a shared WahO! collection.";
  try {
    shareIdSchema.parse(id);
    const share = await readShare(id);
    title = share.title;
    description = share.snapshot.items.length + " shared items.";
    const agent = (await headers()).get("user-agent") ?? "";
    await recordShareEvent(
      id,
      "preview",
      null,
      randomUUID(),
      0,
      /bot|slack|discord|whatsapp|telegram|facebookexternalhit|twitter/i.test(
        agent,
      )
        ? "bot"
        : "unknown",
    );
  } catch {}
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const {id}=await params;
  return <SharedPage key={id} id={id} />;
}

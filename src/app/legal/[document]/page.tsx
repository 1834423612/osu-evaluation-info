import { notFound } from "next/navigation";
import { LegalPage } from "@/components/legal/legal-page";
import { legalDocuments } from "@/content/legal/policy";
import enTerms from "@/content/legal/en/terms.json";
import enPrivacy from "@/content/legal/en/privacy.json";
import enSecurity from "@/content/legal/en/security.json";
import zhTerms from "@/content/legal/zh/terms.json";
import zhPrivacy from "@/content/legal/zh/privacy.json";
import zhSecurity from "@/content/legal/zh/security.json";
const content = {
  terms: { en: enTerms, zh: zhTerms },
  privacy: { en: enPrivacy, zh: zhPrivacy },
  security: { en: enSecurity, zh: zhSecurity },
};
export const metadata = { title: "Policies & account security" };
export function generateStaticParams() {
  return legalDocuments.map((document) => ({ document }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  if (!legalDocuments.includes(document as (typeof legalDocuments)[number]))
    notFound();
  const id = document as (typeof legalDocuments)[number];
  return <LegalPage key={id} document={id} {...content[id]} />;
}

export const POLICY_VERSION = "2026-11-15";
export const legalDocuments = ["terms", "privacy", "security"] as const;
export type LegalDocument = (typeof legalDocuments)[number];
export type LegalContent = {
  title: string;
  intro: string;
  sections: { title: string; paragraphs: string[] }[];
};

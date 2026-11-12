export type SearchDocument = {
  id: string;
  subject: string;
  subjectName: string;
  catalogNumber: string;
  campusCode: string;
  title: string;
  description: string;
  instructors: string;
};
export type SearchCorrection = {
  from: string;
  to: string;
  kind: "word" | "number" | "subject";
};
export type SearchEvidence = {
  mode: "exact" | "prefix" | "fuzzy" | "relaxed";
  coverage: number;
  fields: string[];
  corrections: SearchCorrection[];
  snippet: string;
};
export type SearchHit = { id: string; score: number; evidence: SearchEvidence };
export type SubjectMatch = { code: string; label: string; score: number };

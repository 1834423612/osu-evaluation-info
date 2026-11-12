export type ReferenceTopicId =
  "instruction-modes" | "components" | "sei" | "ssle" | "scoring";
export type ReferenceSection = {
  title: string;
  body?: string[];
  entries?: { code?: string; title: string; detail?: string; badge?: string }[];
  ordered?: boolean;
  scale?: { value: number; label: string }[];
  formula?: boolean;
};
export type ReferenceTopic = {
  id: ReferenceTopicId;
  category: string;
  title: string;
  summary: string;
  sections: ReferenceSection[];
  sources: { title: string; url: string }[];
};

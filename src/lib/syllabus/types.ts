export type SyllabusTerm = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  published: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type SyllabusEntry = {
  code: string;
  entityId: string;
  termId: string;
  termName: string;
  termCode: string | null;
  subject: string;
  catalogNumber: string;
  classNumber: string;
  sectionIdentifier: string;
  title: string;
  subtitle: string;
  visibility: string;
  hasUploads: boolean;
};

export type SyllabusComponent = {
  id: string;
  type: string;
  order: number;
  locale: string;
  html: string;
  officialHtml?: string;
};

export type SyllabusDocument = {
  entry: SyllabusEntry;
  snapshotId: string;
  modifiedAt: string | null;
  components: SyllabusComponent[];
};

export type SyllabusDelivery = "official-direct" | "official-relay" | "backup";
export type SyllabusResult<T> = {
  data: T;
  source: SyllabusDelivery;
  fetchedAt: string;
};

export type SyllabusQuery = {
  subject: string;
  catalogNumber: string;
  termCode: string;
};

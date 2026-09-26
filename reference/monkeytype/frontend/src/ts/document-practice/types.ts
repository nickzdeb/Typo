export type DocumentKind = "text" | "pdf" | "webpage";

export type LocalDocument = {
  id: string;
  title: string;
  kind: DocumentKind;
  sourceName: string;
  text: string;
  fingerprint: string;
  pageCount?: number;
  warnings: string[];
  createdAt: number;
  updatedAt: number;
  lastPracticedAt?: number;
};

export type ExtractedDocument = {
  title: string;
  text: string;
  pageCount?: number;
  warnings: string[];
};

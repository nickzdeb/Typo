export type DocumentKind = "text" | "html" | "pdf";

export type DocumentRecord = {
  id: string;
  title: string;
  kind: DocumentKind;
  sourceName: string;
  sourcePath?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  cursor: number;
  completed: boolean;
};

export type PickedFile = {
  name: string;
  path: string;
  bytes: Uint8Array;
};

export type DesktopApi = {
  pickFile: () => Promise<PickedFile | null>;
  listDocuments: () => Promise<DocumentRecord[]>;
  saveDocument: (document: DocumentRecord) => Promise<DocumentRecord>;
  deleteDocument: (id: string) => Promise<void>;
  readSource: (id: string) => Promise<Uint8Array | null>;
};

export type DocumentKind = "text" | "html" | "pdf" | "docx" | "pptx";

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
  /** Character offsets in `text` where each PDF page / PPTX slide begins (first is always 0).
   *  Lets the preview pane track and highlight which page/slide the typing cursor is in.
   *  Undefined for kinds without that structure, and for documents imported before this existed. */
  sectionBreaks?: number[];
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

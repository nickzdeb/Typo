import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LocalDocument } from "./types";

interface DocumentPracticeDB extends DBSchema {
  documents: {
    key: string;
    value: LocalDocument;
    indexes: { updatedAt: number };
  };
}

const databaseName = "monkeytype-document-practice";
let databasePromise: Promise<IDBPDatabase<DocumentPracticeDB>> | undefined;

function getDatabase(): Promise<IDBPDatabase<DocumentPracticeDB>> {
  databasePromise ??= openDB<DocumentPracticeDB>(databaseName, 1, {
    upgrade(database) {
      const store = database.createObjectStore("documents", { keyPath: "id" });
      store.createIndex("updatedAt", "updatedAt");
    },
  });
  return databasePromise;
}

function createId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "document-" + Date.now() + "-" + crypto.getRandomValues(new Uint32Array(1))[0];
}

export async function listDocuments(): Promise<LocalDocument[]> {
  const database = await getDatabase();
  const documents = await database.getAllFromIndex("documents", "updatedAt");
  return documents.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocument(id: string): Promise<LocalDocument | undefined> {
  const database = await getDatabase();
  return database.get("documents", id);
}

export async function saveDocument(
  document: Omit<LocalDocument, "id" | "createdAt" | "updatedAt"> &
    Partial<Pick<LocalDocument, "id" | "createdAt" | "updatedAt">>,
): Promise<LocalDocument> {
  const now = Date.now();
  const saved: LocalDocument = {
    ...document,
    id: document.id ?? createId(),
    createdAt: document.createdAt ?? now,
    updatedAt: document.updatedAt ?? now,
  };
  const database = await getDatabase();
  await database.put("documents", saved);
  return saved;
}

export async function markDocumentPracticed(id: string): Promise<void> {
  const document = await getDocument(id);
  if (document === undefined) return;
  await saveDocument({
    ...document,
    lastPracticedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await getDatabase();
  await database.delete("documents", id);
}

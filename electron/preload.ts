import { contextBridge, ipcRenderer } from "electron";
import type { DocumentRecord, PickedFile } from "../src/shared/types";

contextBridge.exposeInMainWorld("desktopApi", {
  pickFile: (): Promise<PickedFile | null> => ipcRenderer.invoke("documents:pick"),
  listDocuments: (): Promise<DocumentRecord[]> => ipcRenderer.invoke("documents:list"),
  saveDocument: (document: DocumentRecord): Promise<DocumentRecord> =>
    ipcRenderer.invoke("documents:save", document),
  deleteDocument: (id: string): Promise<void> => ipcRenderer.invoke("documents:delete", id),
  readSource: (id: string): Promise<Uint8Array | null> => ipcRenderer.invoke("documents:readSource", id),
});

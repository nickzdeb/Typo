import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { DocumentRecord, PickedFile } from "../src/shared/types";

const maxImportBytes = 100 * 1024 * 1024;
let mainWindow: BrowserWindow | undefined;

function storePath(): string {
  return join(app.getPath("userData"), "documents.json");
}

async function readDocuments(): Promise<DocumentRecord[]> {
  try {
    return JSON.parse(await readFile(storePath(), "utf8")) as DocumentRecord[];
  } catch {
    return [];
  }
}

async function writeDocuments(documents: DocumentRecord[]): Promise<void> {
  await writeFile(storePath(), JSON.stringify(documents, null, 2), "utf8");
}

function registerIpc(): void {
  ipcMain.handle("documents:pick", async (): Promise<PickedFile | null> => {
    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        { name: "Supported documents", extensions: ["txt", "md", "markdown", "html", "htm", "pdf"] },
        { name: "All files", extensions: ["*"] },
      ],
    };
    const result = mainWindow === undefined
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(mainWindow, options);
    const filePath = result.filePaths[0];
    if (result.canceled || filePath === undefined) return null;
    const bytes = await readFile(filePath);
    if (bytes.byteLength > maxImportBytes) {
      throw new Error("This file is larger than the 100 MB import limit.");
    }
    return { name: basename(filePath), path: filePath, bytes: new Uint8Array(bytes) };
  });

  ipcMain.handle("documents:list", () => readDocuments());
  ipcMain.handle("documents:save", async (_event, document: DocumentRecord) => {
    const documents = await readDocuments();
    const next = documents.filter((item) => item.id !== document.id);
    next.push(document);
    await writeDocuments(next);
    return document;
  });
  ipcMain.handle("documents:delete", async (_event, id: string) => {
    await writeDocuments((await readDocuments()).filter((item) => item.id !== id));
  });
  ipcMain.handle("documents:readSource", async (_event, id: string): Promise<Uint8Array | null> => {
    const document = (await readDocuments()).find((item) => item.id === id);
    if (document?.sourcePath === undefined) return null;
    const bytes = await readFile(document.sourcePath);
    if (bytes.byteLength > maxImportBytes) throw new Error("This file is larger than the 100 MB preview limit.");
    return new Uint8Array(bytes);
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 480,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
  if (process.env.ELECTRON_RENDERER_URL !== undefined) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

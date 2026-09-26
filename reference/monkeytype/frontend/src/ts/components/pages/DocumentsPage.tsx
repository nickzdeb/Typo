import { For, Show, type JSXElement, createSignal, onMount } from "solid-js";

import { Page } from "../common/Page";
import { Button } from "../common/Button";
import { H2 } from "../common/Headers";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { deleteDocument, listDocuments, saveDocument } from "../../document-practice/store";
import { importLocalFile } from "../../document-practice/extractors";
import { startDocumentPractice } from "../../document-practice/practice";
import { getDocumentWordCount } from "../../document-practice/normalize";
import type { LocalDocument } from "../../document-practice/types";

export function DocumentsPage(): JSXElement {
  const [documents, setDocuments] = createSignal<LocalDocument[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [isImporting, setIsImporting] = createSignal(false);

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    try {
      setDocuments(await listDocuments());
    } catch (error) {
      showErrorNotification("Failed to load local documents", { error });
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => void refresh());

  const importFile = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) return;

    setIsImporting(true);
    try {
      const document = await importLocalFile(file);
      await saveDocument(document);
      await refresh();
      showSuccessNotification("Imported " + document.title);
    } catch (error) {
      showErrorNotification("Failed to import document", { error });
    } finally {
      setIsImporting(false);
    }
  };

  const removeDocument = async (document: LocalDocument): Promise<void> => {
    if (!window.confirm("Delete " + document.title + " from this browser?")) return;
    await deleteDocument(document.id);
    await refresh();
  };

  return (
    <Page id="documents">
      <div class="content-grid grid gap-8">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <H2 fa={{ icon: "fa-file-alt" }} text="local documents" class="pb-0" />
          <label class="inline-flex cursor-pointer items-center justify-center gap-[0.5em] rounded border-0 bg-sub-alt p-[0.5em] text-text transition-[color,background,opacity] duration-125 hover:bg-text hover:text-bg">
            <span>{isImporting() ? "importing..." : "import file"}</span>
            <input
              class="hidden"
              type="file"
              accept=".txt,.md,.markdown,.html,.htm,.pdf,text/plain,text/markdown,text/html,application/pdf"
              disabled={isImporting()}
              onChange={(event) => void importFile(event)}
            />
          </label>
        </div>

        <p class="max-w-3xl text-sub">
          Files stay in this browser. Text-based PDFs are supported; scanned PDFs
          may need OCR and will show an extraction warning.
        </p>

        <Show when={!isLoading()} fallback={<div class="text-sub">loading documents...</div>}>
          <Show
            when={documents().length > 0}
            fallback={<div class="rounded bg-sub-alt p-6 text-sub">No local documents yet.</div>}
          >
            <div class="grid gap-4">
              <For each={documents()}>
                {(document) => (
                  <article class="grid gap-4 rounded bg-sub-alt p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div class="grid gap-1">
                      <h3 class="text-text">{document.title}</h3>
                      <div class="text-sm text-sub">
                        {document.kind} · {getDocumentWordCount(document)} words
                        <Show when={document.pageCount !== undefined}>
                          {" · "}{document.pageCount} pages
                        </Show>
                      </div>
                      <Show when={document.warnings.length > 0}>
                        <div class="text-sm text-error">{document.warnings[0]}</div>
                      </Show>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <Button
                        text="practice"
                        fa={{ icon: "fa-keyboard" }}
                        onClick={() =>
                          void startDocumentPractice(document).catch((error) =>
                            showErrorNotification("Failed to start practice", { error }),
                          )
                        }
                      />
                      <Button
                        text="delete"
                        fa={{ icon: "fa-trash" }}
                        danger
                        onClick={() => void removeDocument(document)}
                      />
                    </div>
                  </article>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </Page>
  );
}

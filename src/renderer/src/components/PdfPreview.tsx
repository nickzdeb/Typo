import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { DocumentRecord } from "../../../shared/types";
import { scrollIntoContainer } from "../lib/scrollIntoContainer";

type PdfPreviewProps = {
  document: DocumentRecord;
  currentIndex: number;
};

// Which entry in `breaks` (sorted ascending, ceilings excluded) contains `index` —
// i.e. the last break that is <= index. `breaks[0]` is always 0, so this always resolves.
function sectionForIndex(breaks: number[], index: number): number {
  let section = 0;
  for (let i = 0; i < breaks.length; i++) {
    if (breaks[i] <= index) section = i;
    else break;
  }
  return section;
}

export function PdfPreview(props: PdfPreviewProps) {
  let previewRoot: HTMLDivElement | undefined;
  const [status, setStatus] = createSignal("Loading PDF preview…");
  let pageElements: HTMLDivElement[] = [];
  let highlightedIndex = -1;

  // Only the document's identity should trigger a full re-render (fetch + re-render every
  // page's canvas). props.document is a new object reference on every progress autosave
  // (~every 400ms while typing) even though it's the same document — without this memo, the
  // effect below re-ran on every one of those, causing a visible flash on every save.
  const documentId = createMemo(() => props.document.id);

  async function renderDocument(documentId: string): Promise<void> {
    if (previewRoot === undefined) return;
    previewRoot.replaceChildren();
    pageElements = [];
    highlightedIndex = -1;
    setStatus("Loading PDF preview…");
    const bytes = await window.desktopApi.readSource(documentId);
    if (bytes === null) {
      setStatus("The original PDF is no longer available at its saved path.");
      return;
    }

    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
    GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await getDocument(
      Object.assign({ data: bytes.slice().buffer }, { enableScripting: false }),
    ).promise;
    const pageLimit = Math.min(pdf.numPages, 24);
    setStatus(pageLimit === pdf.numPages ? `${pdf.numPages} pages` : `Showing first ${pageLimit} of ${pdf.numPages} pages`);

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const wrapper = document.createElement("div");
      wrapper.className = "rounded-lg bg-ink p-2 shadow ring-2 ring-transparent transition";
      const canvas = document.createElement("canvas");
      const scale = Math.min(1.2, 760 / viewport.width);
      canvas.width = viewport.width * scale;
      canvas.height = viewport.height * scale;
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      wrapper.append(canvas);
      previewRoot.append(wrapper);
      pageElements.push(wrapper);
      await page.render({
        canvasContext: canvas.getContext("2d")!,
        viewport: page.getViewport({ scale }),
      }).promise;
    }
    syncHighlight();
  }

  function syncHighlight(): void {
    // Both read unconditionally, before any early return, so Solid always tracks them as
    // this effect's dependencies — an early return skipping one would silently stop this
    // effect from re-running when only that one later changes.
    const currentIndex = props.currentIndex;
    const breaks = props.document.sectionBreaks;
    if (breaks === undefined || breaks.length === 0 || pageElements.length === 0) return;
    const section = Math.min(sectionForIndex(breaks, currentIndex), pageElements.length - 1);
    if (section === highlightedIndex) return;
    pageElements[highlightedIndex]?.classList.replace("ring-accent", "ring-transparent");
    pageElements[section]?.classList.replace("ring-transparent", "ring-accent");
    if (previewRoot !== undefined && pageElements[section] !== undefined) {
      scrollIntoContainer(previewRoot, pageElements[section], "center");
    }
    highlightedIndex = section;
  }

  createEffect(() => {
    void renderDocument(documentId()).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Could not render this PDF.");
    });
  });

  // Lightweight: only toggles an existing element's class and scrolls — never re-fetches
  // or re-renders a page, so this can react to every keystroke without flashing.
  // (syncHighlight reads props.currentIndex/props.document itself, which is what this
  // effect actually tracks.)
  createEffect(syncHighlight);

  onCleanup(() => {
    pageElements = [];
  });

  return (
    <article class="flex min-h-0 flex-col rounded-xl bg-panel p-5 shadow-xl">
      <div class="mb-4 flex items-center justify-between gap-3">
        <p class="text-xs uppercase tracking-wide text-muted">document preview</p>
        <span class="text-xs text-muted">{status()}</span>
      </div>
      <div ref={previewRoot} class="min-h-0 flex-1 space-y-4 overflow-auto pr-1" />
    </article>
  );
}

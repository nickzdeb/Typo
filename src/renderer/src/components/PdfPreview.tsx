import { createEffect, createSignal } from "solid-js";
import type { DocumentRecord } from "../../../shared/types";

type PdfPreviewProps = {
  document: DocumentRecord;
};

export function PdfPreview(props: PdfPreviewProps) {
  let previewRoot: HTMLDivElement | undefined;
  const [status, setStatus] = createSignal("Loading PDF preview…");

  async function renderDocument(documentId: string): Promise<void> {
    if (previewRoot === undefined) return;
    previewRoot.replaceChildren();
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
      wrapper.className = "rounded-lg bg-ink p-2 shadow";
      const canvas = document.createElement("canvas");
      const scale = Math.min(1.2, 760 / viewport.width);
      canvas.width = viewport.width * scale;
      canvas.height = viewport.height * scale;
      canvas.style.width = "100%";
      canvas.style.height = "auto";
      wrapper.append(canvas);
      previewRoot.append(wrapper);
      await page.render({
        canvasContext: canvas.getContext("2d")!,
        viewport: page.getViewport({ scale }),
      }).promise;
    }
  }

  createEffect(() => {
    void renderDocument(props.document.id).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Could not render this PDF.");
    });
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

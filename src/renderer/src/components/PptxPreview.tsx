import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { DocumentRecord } from "../../../shared/types";

type PptxPreviewProps = {
  document: DocumentRecord;
  currentIndex: number;
};

// Which entry in `breaks` (sorted ascending) contains `index` — the last break <= index.
// `breaks[0]` is always 0, so this always resolves to a valid section.
function sectionForIndex(breaks: number[], index: number): number {
  let section = 0;
  for (let i = 0; i < breaks.length; i++) {
    if (breaks[i] <= index) section = i;
    else break;
  }
  return section;
}

export function PptxPreview(props: PptxPreviewProps) {
  let previewRoot: HTMLDivElement | undefined;
  const [status, setStatus] = createSignal("Loading slide preview…");
  // Indexed by slide number (not by rendered-card position — most slides have no
  // image/equation and render no card at all, so this can have holes).
  let slideElements: (HTMLDivElement | undefined)[] = [];
  let highlightedSlide = -1;

  // Only the document's identity should trigger a full re-parse + re-render of every
  // slide's images/equations. props.document is a new object reference on every progress
  // autosave (~every 400ms while typing) even though it's the same document — without this
  // memo, the effect below re-ran on every one of those, causing a visible flash on every save.
  const documentId = createMemo(() => props.document.id);

  async function renderSlides(documentId: string): Promise<void> {
    if (previewRoot === undefined) return;
    previewRoot.replaceChildren();
    slideElements = [];
    highlightedSlide = -1;
    setStatus("Loading slide preview…");
    const bytes = await window.desktopApi.readSource(documentId);
    if (bytes === null) {
      setStatus("The original PPTX is no longer available at its saved path.");
      return;
    }

    const { parsePptx } = await import("../core/pptx");
    const slides = await parsePptx(bytes);
    const withMedia = slides.filter((slide) => slide.images.length > 0 || slide.equations.length > 0);
    setStatus(
      withMedia.length === 0
        ? `${slides.length} slides — no images or equations to preview`
        : `${withMedia.length} of ${slides.length} slides have images or equations`,
    );

    slides.forEach((slide, index) => {
      if (slide.images.length === 0 && slide.equations.length === 0) return;

      const card = document.createElement("div");
      card.className = "space-y-3 rounded-lg bg-ink p-3 shadow ring-2 ring-transparent transition";

      const label = document.createElement("p");
      label.className = "text-xs uppercase tracking-wide text-muted";
      label.textContent = `Slide ${index + 1}`;
      card.append(label);

      for (const image of slide.images) {
        const img = document.createElement("img");
        img.src = image;
        img.className = "w-full rounded";
        card.append(img);
      }

      for (const equation of slide.equations) {
        const box = document.createElement("div");
        box.className = "overflow-x-auto rounded border border-panelMuted bg-panelMuted px-3 py-2 text-sm text-ink";
        box.innerHTML = equation.mathml;
        if (box.querySelector("math") === null) {
          box.textContent = equation.text.length > 0 ? equation.text : "(equation)";
        }
        card.append(box);
      }

      previewRoot?.append(card);
      slideElements[index] = card;
    });
    syncHighlight();
  }

  function syncHighlight(): void {
    // Both read unconditionally, before any early return, so Solid always tracks them as
    // this effect's dependencies — an early return skipping one would silently stop this
    // effect from re-running when only that one later changes.
    const currentIndex = props.currentIndex;
    const breaks = props.document.sectionBreaks;
    if (breaks === undefined || breaks.length === 0) return;
    const slide = sectionForIndex(breaks, currentIndex);
    if (slide === highlightedSlide) return;
    slideElements[highlightedSlide]?.classList.replace("ring-accent", "ring-transparent");
    const target = slideElements[slide];
    target?.classList.replace("ring-transparent", "ring-accent");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightedSlide = slide;
  }

  createEffect(() => {
    void renderSlides(documentId()).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Could not render this presentation.");
    });
  });

  // Lightweight: only toggles an existing element's class and scrolls — never re-fetches
  // or re-renders a slide, so this can react to every keystroke without flashing.
  createEffect(syncHighlight);

  onCleanup(() => {
    slideElements = [];
  });

  return (
    <article class="flex min-h-0 flex-col rounded-xl bg-panel p-5 shadow-xl">
      <div class="mb-4 flex items-center justify-between gap-3">
        <p class="text-xs uppercase tracking-wide text-muted">slide preview</p>
        <span class="text-xs text-muted">{status()}</span>
      </div>
      <div ref={previewRoot} class="min-h-0 flex-1 space-y-4 overflow-auto pr-1" />
      <p class="mt-3 text-xs text-muted">Images and equations are shown for reference only — they aren't part of the typing passage.</p>
    </article>
  );
}

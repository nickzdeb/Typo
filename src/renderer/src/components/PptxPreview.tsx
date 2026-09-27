import { For, Index, Show, createEffect, createMemo, createSignal } from "solid-js";
import type { DocumentRecord } from "../../../shared/types";
import type { PptxDocument } from "../core/pptx";
import { cn } from "../lib/cn";

type PptxPreviewProps = {
  document: DocumentRecord;
  currentIndex: number;
};

// Which entry in `breaks` (sorted ascending) contains `index` — the last break <= index.
// `breaks[0]` is always 0, so this always resolves to a valid slide index.
function sectionForIndex(breaks: number[], index: number): number {
  let section = 0;
  for (let i = 0; i < breaks.length; i++) {
    if (breaks[i] <= index) section = i;
    else break;
  }
  return section;
}

export function PptxPreview(props: PptxPreviewProps) {
  const [status, setStatus] = createSignal("Loading slide preview…");
  const [pptx, setPptx] = createSignal<PptxDocument>();
  let slideRefs: (HTMLDivElement | undefined)[] = [];

  // Only the document's identity should trigger a full re-parse of every slide. props.document
  // is a new object reference on every progress autosave (~every 400ms while typing) even
  // though it's the same document — without this memo, re-parsing on every one of those caused
  // a visible flash while typing.
  const documentId = createMemo(() => props.document.id);

  async function load(documentId: string): Promise<void> {
    setStatus("Loading slide preview…");
    setPptx(undefined);
    slideRefs = [];
    const bytes = await window.desktopApi.readSource(documentId);
    if (bytes === null) {
      setStatus("The original PPTX is no longer available at its saved path.");
      return;
    }
    const { parsePptx } = await import("../core/pptx");
    const parsed = await parsePptx(bytes);
    setStatus(`${parsed.slides.length} slide${parsed.slides.length === 1 ? "" : "s"}`);
    setPptx(parsed);
  }

  createEffect(() => {
    void load(documentId()).catch((error) => {
      setStatus(error instanceof Error ? error.message : "Could not render this presentation.");
    });
  });

  const currentSlide = createMemo(() => {
    const breaks = props.document.sectionBreaks;
    if (breaks === undefined || breaks.length === 0) return -1;
    return sectionForIndex(breaks, props.currentIndex);
  });

  // Cheap (just scrolls an already-rendered element) — reacts to every keystroke without
  // re-triggering the full parse/render above.
  createEffect(() => {
    slideRefs[currentSlide()]?.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  return (
    <article class="flex min-h-0 flex-col rounded-xl bg-panel p-5 shadow-xl">
      <div class="mb-4 flex items-center justify-between gap-3">
        <p class="text-xs uppercase tracking-wide text-muted">slide preview</p>
        <span class="text-xs text-muted">{status()}</span>
      </div>
      <div class="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
        <Show when={pptx()}>
          {(doc) => (
            <Index each={doc().slides}>
              {(slide, index) => (
                <div
                  ref={(element) => (slideRefs[index] = element)}
                  class={cn(
                    "relative w-full overflow-hidden rounded-lg bg-white shadow ring-2 transition",
                    currentSlide() === index ? "ring-accent" : "ring-transparent",
                  )}
                  style={{ "aspect-ratio": `${doc().slideWidthEmu} / ${doc().slideHeightEmu}`, "container-type": "inline-size" }}
                >
                  <For each={slide().shapes}>
                    {(shape) =>
                      shape.kind === "image" ? (
                        <img
                          src={shape.src}
                          class="absolute object-contain"
                          style={{ left: `${shape.left}%`, top: `${shape.top}%`, width: `${shape.width}%`, height: `${shape.height}%` }}
                        />
                      ) : (
                        <div
                          class="absolute overflow-hidden text-[#1a1a1a]"
                          style={{
                            left: `${shape.left}%`,
                            top: `${shape.top}%`,
                            width: `${shape.width}%`,
                            height: `${shape.height}%`,
                            "font-size": `${shape.fontSizeCqw}cqw`,
                            "line-height": 1.25,
                          }}
                        >
                          <For each={shape.blocks}>
                            {(block) => (block.kind === "text" ? <p class="whitespace-pre-wrap">{block.text}</p> : <div class="my-1" innerHTML={block.mathml} />)}
                          </For>
                        </div>
                      )
                    }
                  </For>
                </div>
              )}
            </Index>
          )}
        </Show>
      </div>
      <p class="mt-3 text-xs text-muted">
        A best-effort layout reconstruction from the slide XML (text and images positioned where they really are) — not part of the typing text. Fonts, colors, and effects
        aren't replicated; placeholders without an explicit position use a plausible title/body guess instead of the real layout.
      </p>
    </article>
  );
}

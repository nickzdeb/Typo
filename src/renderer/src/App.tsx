import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import type { DocumentRecord } from "../../shared/types";
import { extractDocument } from "./core/extract";
import { normalizeDocumentText, wordCount } from "./core/normalize";
import { cn } from "./lib/cn";
import { PdfPreview } from "./components/PdfPreview";
import { PptxPreview } from "./components/PptxPreview";
import { ThemeSettings } from "./components/ThemeSettings";
import { VirtualKeyboard } from "./components/VirtualKeyboard";

const minCenterWidth = 320;
const saveDebounceMs = 400;

type CharResult = "correct" | "incorrect" | undefined;

function hasSlideOrPagePreview(kind: DocumentRecord["kind"]): boolean {
  return kind === "pdf" || kind === "pptx";
}

function newId(): string {
  return crypto.randomUUID();
}

export function App() {
  let inputRef: HTMLTextAreaElement | undefined;
  const [documents, setDocuments] = createSignal<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = createSignal<string>();
  const [results, setResults] = createStore<CharResult[]>([]);
  const [typingIndex, setTypingIndex] = createSignal(0);
  const [maxReachedIndex, setMaxReachedIndex] = createSignal(0);
  const [correctCount, setCorrectCount] = createSignal(0);
  const [incorrectCount, setIncorrectCount] = createSignal(0);
  const [message, setMessage] = createSignal("Choose a document to begin.");
  const [isBusy, setIsBusy] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);
  const [sessionStartedAt, setSessionStartedAt] = createSignal<number>();
  const [sidebarWidth, setSidebarWidth] = createSignal(280);
  const [previewWidth, setPreviewWidth] = createSignal(420);
  const [showPreview, setShowPreview] = createSignal(true);

  function focusInput(): void {
    inputRef?.focus();
  }

  function clampPanelWidths(): void {
    const total = window.innerWidth;
    const previewSpace = showPreview() ? previewWidth() + 8 : 0;
    const maxSidebar = Math.max(200, total - minCenterWidth - previewSpace);
    setSidebarWidth((width) => Math.min(width, maxSidebar));
    if (showPreview()) {
      const maxPreview = Math.max(260, total - sidebarWidth() - minCenterWidth - 8);
      setPreviewWidth((width) => Math.min(width, maxPreview));
    }
  }

  onMount(() => {
    clampPanelWidths();
    window.addEventListener("resize", clampPanelWidths);
    onCleanup(() => window.removeEventListener("resize", clampPanelWidths));
  });

  onMount(() => {
    const stealFocusForTyping = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (selected() === undefined) return;
      if (document.activeElement === inputRef) return;
      inputRef?.focus();
    };
    window.addEventListener("keydown", stealFocusForTyping);
    onCleanup(() => window.removeEventListener("keydown", stealFocusForTyping));
  });

  function beginResize(kind: "sidebar" | "preview", event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const initial = kind === "sidebar" ? sidebarWidth() : previewWidth();
    const onMove = (moveEvent: PointerEvent): void => {
      const delta = moveEvent.clientX - startX;
      if (kind === "sidebar") setSidebarWidth(Math.max(220, Math.min(440, initial + delta)));
      else setPreviewWidth(Math.max(300, Math.min(700, initial - delta)));
    };
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const selected = createMemo(() => documents().find((item) => item.id === selectedId()));
  const progress = createMemo(() => {
    const document = selected();
    return document === undefined || document.text.length === 0 ? 0 : maxReachedIndex() / document.text.length;
  });
  const metrics = createMemo(() => {
    const correct = correctCount();
    const incorrect = incorrectCount();
    const total = correct + incorrect;
    const startedAt = sessionStartedAt();
    const elapsedMinutes = startedAt === undefined ? 0 : (Date.now() - startedAt) / 60000;
    return {
      correct,
      errors: incorrect,
      accuracy: total === 0 ? 100 : (correct / total) * 100,
      wpm: elapsedMinutes <= 0 ? 0 : correct / 5 / elapsedMinutes,
    };
  });

  const refresh = async (): Promise<void> => {
    const stored = await window.desktopApi.listDocuments();
    const next = stored.map((item) => ({ ...item, text: normalizeDocumentText(item.text) }));
    setDocuments(next.sort((a, b) => b.updatedAt - a.updatedAt));
    if (selectedId() === undefined && next[0] !== undefined) selectDocument(next[0]);
  };

  onMount(() => void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Desktop bridge unavailable.")));

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: { document: DocumentRecord; cursor: number } | undefined;

  async function commitProgress(document: DocumentRecord, cursor: number): Promise<void> {
    const completed = cursor >= document.text.length;
    const updated = { ...document, cursor, completed, updatedAt: Date.now() };
    await window.desktopApi.saveDocument(updated);
    setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    if (completed) setMessage("Document complete. Excellent work.");
  }

  function flushPendingSave(): void {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    if (pendingSave === undefined) return;
    const { document, cursor } = pendingSave;
    pendingSave = undefined;
    void commitProgress(document, cursor);
  }

  function scheduleSave(document: DocumentRecord, cursor: number): void {
    pendingSave = { document, cursor };
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushPendingSave, saveDebounceMs);
  }

  onCleanup(flushPendingSave);

  function selectDocument(document: DocumentRecord): void {
    flushPendingSave();
    setSelectedId(document.id);
    setResults(new Array<CharResult>(document.text.length).fill(undefined));
    const startAt = Math.min(document.cursor, document.text.length);
    setTypingIndex(startAt);
    setMaxReachedIndex(startAt);
    setCorrectCount(0);
    setIncorrectCount(0);
    setSessionStartedAt(undefined);
    setShowPreview(hasSlideOrPagePreview(document.kind));
    setMessage(document.completed ? "This document is complete. Restart it whenever you want." : "Click anywhere in the text to start typing from there.");
    focusInput();
  }

  async function importFile(): Promise<void> {
    setIsBusy(true);
    try {
      const file = await window.desktopApi.pickFile();
      if (file === null) return;
      const extracted = await extractDocument(file);
      if (extracted.text.length === 0) throw new Error("No readable text was found in this file.");
      const now = Date.now();
      const document: DocumentRecord = {
        id: newId(),
        title: extracted.title,
        kind: extracted.kind,
        sourceName: file.name,
        sourcePath: file.path,
        text: extracted.text,
        createdAt: now,
        updatedAt: now,
        cursor: 0,
        completed: false,
        sectionBreaks: extracted.sectionBreaks,
      };
      await window.desktopApi.saveDocument(document);
      setDocuments((current) => [document, ...current]);
      selectDocument(document);
      setMessage("Imported " + document.title + ". Click anywhere in the text to start typing from there.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteSelected(): Promise<void> {
    const document = selected();
    if (document === undefined) return;
    flushPendingSave();
    await window.desktopApi.deleteDocument(document.id);
    const next = documents().filter((item) => item.id !== document.id);
    setDocuments(next);
    if (next[0] !== undefined) selectDocument(next[0]);
    else setSelectedId(undefined);
  }

  async function restartSelected(): Promise<void> {
    const document = selected();
    if (document === undefined) return;
    flushPendingSave();
    const updated = { ...document, cursor: 0, completed: false, updatedAt: Date.now() };
    await window.desktopApi.saveDocument(updated);
    setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    selectDocument(updated);
  }

  function recordResult(index: number, correct: boolean): void {
    const previous = results[index];
    if (previous === "correct") setCorrectCount((count) => count - 1);
    else if (previous === "incorrect") setIncorrectCount((count) => count - 1);
    setResults(index, correct ? "correct" : "incorrect");
    if (correct) setCorrectCount((count) => count + 1);
    else setIncorrectCount((count) => count + 1);
  }

  function clearResult(index: number): void {
    const previous = results[index];
    if (previous === "correct") setCorrectCount((count) => count - 1);
    else if (previous === "incorrect") setIncorrectCount((count) => count - 1);
    setResults(index, undefined);
  }

  function jumpTo(index: number): void {
    setTypingIndex(index);
    focusInput();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const document = selected();
    if (document === undefined) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === "Backspace") {
      event.preventDefault();
      const index = typingIndex();
      if (index === 0) return;
      clearResult(index - 1);
      setTypingIndex(index - 1);
      return;
    }

    const expected = event.key === "Enter" ? "\n" : event.key.length === 1 ? event.key : undefined;
    if (expected === undefined) return;
    event.preventDefault();

    const index = typingIndex();
    if (index >= document.text.length) return;
    if (sessionStartedAt() === undefined) setSessionStartedAt(Date.now());

    recordResult(index, document.text[index] === expected);
    const nextIndex = index + 1;
    setTypingIndex(nextIndex);
    if (nextIndex > maxReachedIndex()) {
      setMaxReachedIndex(nextIndex);
      scheduleSave(document, nextIndex);
    }
  }

  return (
    <main class="min-h-screen bg-canvas text-ink">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-panelMuted px-8 py-5">
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-accent">local typing practice</p>
          <h1 class="mt-1 text-2xl font-semibold">Typo</h1>
        </div>
        <div class="flex items-center gap-2">
          <ThemeSettings />
          <button class="rounded-lg bg-accent px-4 py-2 font-medium text-canvas transition hover:brightness-110 disabled:opacity-50" disabled={isBusy()} onClick={() => void importFile()}>
            {isBusy() ? "Importing…" : "Import document"}
          </button>
        </div>
      </header>

      <div class="grid min-h-[calc(100vh-89px)]" style={{ "grid-template-columns": sidebarWidth() + "px 8px minmax(0, 1fr)" }}>
        <aside class="flex flex-col border-r border-panelMuted bg-panel px-4 py-5">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Library</h2>
            <span class="text-xs text-muted">{documents().length}</span>
          </div>
          <Show when={documents().length > 0} fallback={<p class="text-sm leading-6 text-muted">Imported documents will appear here.</p>}>
            <div class="grid gap-2">
              <For each={documents()}>
                {(document) => (
                  <button class={cn("rounded-lg px-3 py-3 text-left transition hover:bg-panelMuted", selectedId() === document.id && "bg-panelMuted")} onClick={() => selectDocument(document)}>
                    <div class="truncate font-medium">{document.title}</div>
                    <div class="mt-1 text-xs text-muted">{document.kind} · {wordCount(document.text)} words</div>
                    <div class="mt-2 h-1 rounded bg-canvas"><div class="h-1 rounded bg-accent" style={{ width: `${document.text.length === 0 ? 0 : (document.cursor / document.text.length) * 100}%` }} /></div>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <VirtualKeyboard />
        </aside>
        <div class="cursor-col-resize bg-panelMuted transition hover:bg-accent" onPointerDown={(event) => beginResize("sidebar", event)} />

        <section class="grid min-h-0 grid-rows-[auto_1fr] gap-5 p-8">
          <Show when={selected()} fallback={<div class="grid place-items-center rounded-xl border border-dashed border-panelMuted bg-panel p-12 text-center"><div><h2 class="text-xl font-semibold">Bring a document to practice</h2><p class="mt-2 max-w-md text-muted">Import a text file, HTML file, Markdown file, PowerPoint, or PDF. The document stays on this computer.</p><Show when={message() !== "Choose a document to begin."}><p class="mt-4 text-sm text-error">{message()}</p></Show></div></div>}>
            {(document) => <>
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="text-xl font-semibold">{document().title}</h2>
                  <p class="mt-1 text-sm text-muted">{wordCount(document().text)} words · {Math.round(progress() * 100)}% complete</p>
                </div>
                <div class="flex gap-2">
                  <Show when={hasSlideOrPagePreview(document().kind)}><button class="rounded-lg px-3 py-2 text-sm text-muted hover:bg-panelMuted" onClick={() => setShowPreview(!showPreview())}>{showPreview() ? "Hide preview" : "Show preview"}</button></Show>
                  <button class="rounded-lg px-3 py-2 text-sm text-muted hover:bg-panelMuted" onClick={() => void restartSelected()}>Restart</button>
                  <button class="rounded-lg px-3 py-2 text-sm text-error hover:bg-panelMuted" onClick={() => void deleteSelected()}>Remove</button>
                </div>
              </div>

              <div class="grid min-h-0 gap-5" style={{ "grid-template-columns": hasSlideOrPagePreview(document().kind) && showPreview() ? "minmax(0, 1fr) 8px " + previewWidth() + "px" : "minmax(0, 1fr)" }}>
                <article class="flex min-h-0 min-w-0 flex-col rounded-xl bg-panel p-7 shadow-xl">
                  <div class="mb-5 flex items-center justify-between">
                    <p class="text-xs uppercase tracking-wide text-muted">typing text</p>
                    <span class="text-xs text-muted">{maxReachedIndex()} / {document().text.length} characters · click anywhere in the text to jump there</span>
                  </div>
                  <div class="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[["wpm", metrics().wpm.toFixed(0)], ["accuracy", metrics().accuracy.toFixed(0) + "%"], ["errors", String(metrics().errors)], ["progress", Math.round(progress() * 100) + "%"]].map(([label, value]) => <div class="rounded-lg bg-panelMuted px-3 py-2"><div class="text-xs uppercase tracking-wide text-muted">{label}</div><div class="mt-1 text-lg font-semibold text-ink">{value}</div></div>)}
                  </div>
                  <div
                    class={cn(
                      "relative min-h-40 flex-1 cursor-text overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-panelMuted p-5 font-mono text-lg leading-9 outline-none transition",
                      isFocused() ? "ring-2 ring-accent" : "ring-1 ring-transparent",
                    )}
                    onClick={focusInput}
                  >
                    <Index each={Array.from(document().text)}>
                      {(character, index) => (
                        <>
                          <span
                            class={cn(results[index] === "correct" ? "text-success" : results[index] === "incorrect" ? "bg-error/30 text-error" : index === typingIndex() ? "border-b-2 border-accent" : "text-muted")}
                            onClick={(event) => {
                              event.stopPropagation();
                              jumpTo(index);
                            }}
                          >
                            {character() === " " ? "·" : character() === "\n" ? "↵\n" : character()}
                          </span>
                          {character() === " " && <wbr />}
                        </>
                      )}
                    </Index>
                    <Show when={!isFocused()}>
                      <div class="absolute inset-0 grid place-items-center rounded-lg bg-canvas/70 text-sm text-muted">
                        Click here or start typing to continue
                      </div>
                    </Show>
                  </div>
                  <textarea
                    ref={inputRef}
                    class="fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
                    style={{ "pointer-events": "none" }}
                    autofocus
                    spellcheck={false}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                  />
                  <p class="mt-4 text-sm text-muted">{message()}</p>
                </article>
                <Show when={hasSlideOrPagePreview(document().kind) && showPreview()}>
                  <div class="cursor-col-resize bg-panelMuted transition hover:bg-accent" onPointerDown={(event) => beginResize("preview", event)} />
                  <Show when={document().kind === "pdf"}><PdfPreview document={document()} currentIndex={typingIndex()} /></Show>
                  <Show when={document().kind === "pptx"}><PptxPreview document={document()} currentIndex={typingIndex()} /></Show>
                </Show>
              </div>            </>}
          </Show>
        </section>
      </div>
    </main>
  );
}

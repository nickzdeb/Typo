# Typo design and handoff

Updated: 2026-09-27

## Product goal

Create a local desktop application that lets a user choose a document, read it while typing, and resume practice later without sending document content to a server.

The first product boundary is deliberately narrow: local file import and a focused typing environment. Live webpage capture and browser-extension permissions are excluded for now.

## Why this isn't Monkeytype

This project started from Monkeytype, an online typing website, as reference material. Its authentication, remote configuration, result upload, mixed legacy/Solid frontend, and existing custom-text assumptions made it a poor foundation for a local-first desktop product, so this app owns its own document model, persistence, desktop permissions, and typing session lifecycle from scratch. The old Monkeytype source was kept alongside this app for a while for comparison, then removed once it was no longer needed — it added ~2,100 files and 160+ MB to the repo with nothing here depending on it.

## Architecture

```text
Electron main process
  - native file picker
  - reads selected files
  - persists document records in userData/documents.json
  - exposes a narrow, context-isolated IPC API

Preload bridge
  - pickFile
  - listDocuments
  - saveDocument
  - deleteDocument

Solid renderer
  - document library
  - continuous full-document typing view (click-anywhere-to-jump)
  - typing input and progress UI
  - optional virtual keyboard (key-press visualization)

Renderer document core
  - text/HTML normalization
  - PDF.js / mammoth / pptx extraction
  - per-character correctness tracking
```

## Security decisions

- Renderer has `nodeIntegration: false` and `contextIsolation: true`.
- Renderer uses `sandbox: true`.
- Files are read only after an explicit native file-picker action.
- The preload exposes specific functions rather than raw IPC or filesystem APIs.
- PDF document scripting is disabled.
- Imported HTML is treated as text; its scripts are removed before extraction and never executed as document content.
- The app does not load arbitrary remote URLs in the renderer.

## Document model

`DocumentRecord` currently contains:

- stable id;
- display title and source filename;
- kind: text, html, or pdf;
- normalized extracted text;
- created/updated timestamps;
- character cursor;
- completion flag.

The MVP stores records as JSON in Electron's `userData` directory. This avoids a native database dependency while the data model is still changing. SQLite should replace this storage once local history, migrations, and larger libraries are implemented.

## Typing behavior

The whole document is rendered at once (not chunked into passages — an earlier design that
capped the visible text at 420 characters caused real confusion: it looked like the document
had ended, and overtyping past the cap silently stopped registering keystrokes while the stats
kept climbing). Per character: correct entries in green, incorrect in red, the current position
underlined. Clicking any character jumps the typing cursor there — useful for skipping around
or fixing a section without backspacing through everything after it.

Input is captured via `keydown` on an invisible, always-focused `textarea` (not `input` events
diffed against a string) so a click-driven jump and Backspace both map onto a single "current
index" model cleanly: each printable key (or Enter, for a paragraph break) compares against
`text[index]`, records correct/incorrect, and advances; Backspace steps back and clears that
slot's result. Correctness results live in a `solid-js/store` array (`createStore`, not a plain
signal) so updating one character's result only re-renders that one span — with whole documents
now on screen, a plain signal would re-diff every character on every keystroke.

Progress (the furthest position reached, used for the resume point and the % complete shown in
the library) is saved with a 400ms debounce as you type, rather than only at passage boundaries
as before — coarser passage-sized checkpoints were actually a lower save frequency, not a safety
feature. Exact character-by-character correctness history isn't persisted across sessions
(restarting or reopening a document clears red/green marks and session stats, matching the
existing "Restarting a document resets session metrics" behavior); only the resume position is.

An optional virtual keyboard in the library sidebar lights up each physical key as it's pressed
(matched by `KeyboardEvent.code`, not `.key`, so it reflects physical position regardless of
Shift state) — collapsible, with the preference persisted locally.

## Supported input

### Implemented now

- `.txt`
- `.md` and `.markdown`
- `.html`, `.htm`, `.xhtml`
- `.docx` (via mammoth, raw text only — no styling/images)
- `.pptx`: slide text becomes the typing passage; embedded images and equations render in a slide preview pane (see below), never as typing text
- text-based `.pdf`

### PPTX handling in detail

Slide text is pulled from every text-bearing shape and table cell, in slide order — the same "typable text vs. reference-only visuals" split as PDF, but lighter-weight:

- **Images**: extracted from each slide's relationships and shown as a plain per-slide list in the preview pane — not a pixel-accurate reproduction of the slide layout. Legacy vector formats (EMF/WMF, common in older clip art) aren't renderable in a browser context and are skipped.
- **Equations**: OOXML math (OMML) is structurally separate from slide text (it lives under its own XML namespace), so it's never pulled into the typing passage in the first place — no filtering step needed. For display, a hand-written converter (`core/omml.ts`) maps the common constructs (runs, fractions, super/subscripts, roots, delimiters, n-ary operators like sum/integral) to MathML, which Chromium renders natively with no extra library. Anything outside that subset (matrices, accents, exotic group characters) falls back to flattened plain text in the same slot, so rendering never breaks — it just loses the fancy layout for that one equation.
- Deliberately not attempted: pixel-accurate slide rendering (would need a full layout+rendering engine or bundling something like headless LibreOffice, at odds with staying lightweight) and speaker notes (not "on the slide," so not part of the practice text).

### Planned

- scanned PDF OCR;
- legacy `.doc`, `.odt`, `.rtf`;
- EPUB;
- image files;
- PDF preview and extraction correction;
- document-specific WPM, accuracy, and session history.

## Milestones

### Milestone 1: usable local practice

- [x] Fresh Electron application.
- [x] Local document persistence.
- [x] Text and HTML extraction.
- [x] PDF text extraction.
- [x] Source/typing split view.
- [x] Continuous whole-document typing with click-to-jump and debounced resume-position saves.
- [x] Automated tests.

### Milestone 2: reliable document workflow

- Add preview before saving.
- Preserve paragraph/page metadata.
- Add extraction warnings and editable text.
- Add SQLite migrations and local result history.
- Add document search, rename, and archive.
- Virtualize the typing view's character rendering if very large documents turn out to be slow in practice (see Known technical risks).

### Milestone 3: broader formats

- Add DOCX extraction with a dedicated parser.
- Add EPUB extraction.
- Add optional OCR worker for scanned documents.
- Add PDF page preview and page navigation.

## Immediate next coding tasks

1. Install dependencies with the existing Node 18 environment.
2. Run typecheck and fix Electron-vite/PDF.js declaration issues.
3. Run the app and manually import a TXT file and a PDF.
4. Add unit tests for normalization and extraction (done — see `core/*.test.ts`).
5. Replace JSON persistence with a versioned repository abstraction before adding history.

## Known technical risks

- PDF reading order can be wrong for columns, tables, and unusual layouts.
- PDF files with no text layer need OCR.
- The typing view renders the whole document as individual characters; this is fine for typical documents but could get slow for very large ones (tens of thousands of characters) — virtualization is the fix if that turns out to matter in practice.
- JSON persistence is intentionally temporary and should not be treated as the final database layer.
- The Electron package must keep remote content out of privileged renderer contexts.

## Handoff status

The workspace root is the whole application; there is no separate legacy source tree to reason about anymore.

## Implementation status

Completed in the initial vertical slice:

- Electron main/preload/renderer structure.
- Context-isolated desktop API for file picking and local JSON persistence.
- SolidJS library and source/typing split view.
- TXT, Markdown, HTML, and text-based PDF extraction.
- PDF.js worker bundling with scripting disabled.
- Continuous whole-document typing progress and restart.
- Tailwind styling with project-local color tokens.

Validation in the current environment:

- npm run typecheck passes.
- npm run build passes.
- npm run typecheck passes under Node 18.
- npm run build passes under Node 18.
- npm run dev starts Vite under Node 18. Electron may require the Linux chrome-sandbox helper to be owned by root with mode 4755; this is a host permission issue, not a Node requirement.

## UX milestone

The practice screen displays the whole document at once and tracks live WPM, accuracy, error count, and document progress per character. Restarting a document resets the session metrics.

## Current UX and extraction milestone

- The extracted source-text pane was removed from the practice workspace.
- The typing workspace is central and wraps long passages without horizontal scrolling.
- The library sidebar can be resized by dragging its divider.
- PDF documents get a separate resizable rendered reference pane. PDF pages, diagrams, and images are visible there but are never part of the typing target.
- PDF preview rereads the original file path saved with newly imported documents. Older records created before sourcePath was added should be removed and re-imported to enable preview.
- Greek letters and common math symbols are normalized into keyboardable English names: pi, beta, alpha, infinity, times, square root, and similar names.
- Symbol conversion is intentionally broad for the MVP; a future parser can make conversion context-sensitive for technical notation.

## Continuous-typing milestone (2026-09-27)

Replaced the 420-character passage model with continuous whole-document typing (see "Typing
behavior" above) — the passage cap was reported as a bug ("the document just stops"), and
overtyping past it silently broke rendering while stats kept updating. Also fixed along the way:

- **Theme opacity bug**: `bg-error/30`-style utilities (the incorrect-character highlight) never
  actually applied any styling. Tailwind's color-opacity modifiers need a CSS variable holding
  space-separated `R G B` channels wrapped as `rgb(var(--x) / <alpha-value>)`; the theme system
  had been setting the variables to full hex strings instead (`var(--color-x)` directly), which
  Tailwind can't decompose — it silently drops the utility rather than erroring. Fixed in
  `core/theme.ts` (sets `"R G B"`) and `tailwind.config.cjs` (the `rgb(... / <alpha-value>)`
  wrapper). Compiled CSS was checked directly to confirm the utility now exists at all, not just
  that it looks right on screen.
- Added a small virtual keyboard (`components/VirtualKeyboard.tsx`) in the library sidebar that
  lights up each key as it's physically pressed, collapsible via a "Hide"/"Show" toggle.

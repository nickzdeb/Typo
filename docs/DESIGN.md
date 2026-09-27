# Typo design and handoff

Updated: 2026-09-27

## Product goal

Create a local desktop application that lets a user choose a document, read it while typing, and resume practice later without sending document content to a server.

The first product boundary is deliberately narrow: local file import and a focused typing environment. Live webpage capture and browser-extension permissions are excluded for now.

## Why this isn't Monkeytype

This project started from Monkeytype, an online typing website, as reference material. Its authentication, remote configuration, result upload, mixed legacy/Solid frontend, and existing custom-text assumptions made it a poor foundation for a local-first desktop product, so this app owns its own document model, persistence, desktop permissions, and typing session lifecycle from scratch.

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
  - PDF/PPTX preview pane, tracking the typing cursor

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

`DocumentRecord` (persisted as JSON in Electron's `userData` directory — no native database dependency while the data model is still changing; SQLite should replace this once local history, migrations, and larger libraries are implemented):

- stable id, display title, source filename;
- source file path, when available — used to re-read the original file for PDF/PPTX preview. Records saved before this field existed have none; remove and re-import to get a preview.
- kind: `text`, `html`, `pdf`, `docx`, or `pptx`;
- normalized extracted text;
- created/updated timestamps;
- furthest-reached character cursor and a completion flag;
- `sectionBreaks` (PDF/PPTX only): character offsets where each page/slide begins in `text`, for preview-pane cursor tracking. Records saved before this field existed have none; remove and re-import to get tracking.

## Text normalization

`core/normalize.ts` collapses whitespace, normalizes line endings, and — deliberately broadly, not context-sensitively — spells out Greek letters and common math symbols as keyboardable English words (π → "pi", × → "times", √ → "square root", ...), since the point is to make imported text actually typable on a standard keyboard. A future parser could make this context-sensitive for technical notation instead of blanket substitution.

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
the library) is saved with a 400ms debounce as you type. Exact character-by-character
correctness history isn't persisted across sessions (restarting or reopening a document clears
red/green marks and session stats); only the resume position is.

An optional virtual keyboard in the library sidebar lights up each physical key as it's pressed
(matched by `KeyboardEvent.code`, not `.key`, so it reflects physical position regardless of
Shift state) — collapsible, with the preference persisted locally.

### Preview-pane cursor tracking (PDF/PPTX)

The preview pane uses `sectionBreaks` (see Document model) to compute which page/slide the
typing cursor is currently in, draws a highlight ring around that page's/slide's card, and
scrolls it into view — so clicking anywhere in the typing text to jump there also scrolls the
preview to the matching page/slide, and typing forward through the document scrolls the preview
along with it. Granularity is per-page/per-slide, not per-line or per-character — pixel-accurate
tracking would need retaining every text item's bounding box through extraction and persistence,
a much bigger lift for marginal benefit here.

The preview's full re-render effect (re-fetch + re-render every page/slide) is keyed off a
*memoized* `props.document.id`, not the `document` object directly — that object gets a new
reference on every progress autosave (~every 400ms while typing) even though nothing about the
document's content changed, and keying off the object caused the preview to flash on every one
of those. The lightweight highlight/scroll effect doesn't need this care; re-running it
unnecessarily is cheap.

## Supported input

### Implemented now

- `.txt`
- `.md` and `.markdown`
- `.html`, `.htm`, `.xhtml`
- `.docx` (via mammoth, raw text only — no styling/images)
- `.pptx`: slide text becomes typing text; the preview pane reconstructs each slide's actual layout (text and images positioned where they really are)
- text-based `.pdf`

### PPTX handling in detail

`core/pptx.ts` walks each slide's shape tree directly (`<p:sp>`, `<p:pic>`, one level of `<p:grpSp>` group — deeper nesting isn't handled) rather than sweeping all text/images flatly, because the preview needs each shape's actual position, not just its content:

- **Position**: each shape's `<a:xfrm>` off/ext gives its EMU position, converted to a percentage of the slide's own size (read from `presentation.xml`'s `sldSz`, defaulting to 16:9 if absent) — rendered as absolutely-positioned elements over a fixed-aspect-ratio slide container. A shape *without* an explicit position (common for title/body placeholders, which inherit their position from the slide layout — a further inheritance chain this parser doesn't resolve) gets a plausible title-at-top or body-below-it guess instead of the real layout.
- **Font size**: read from the first run's `sz` (hundredths of a point), converted to CSS container-query-width units (`cqw`) so text scales proportionally with the rendered slide size without any JS measurement.
- **Images**: resolved via the slide's relationships file and embedded as data URIs, positioned like any other shape. Legacy vector formats (EMF/WMF, common in older clip art) aren't renderable in a browser context and are skipped.
- **Equations**: OOXML math (OMML) is structurally separate from slide text (its own XML namespace), so it's never pulled into typing text in the first place — no filtering step needed. A paragraph containing one becomes its own block within its shape. For display, a hand-written converter (`core/omml.ts`) maps the common constructs (runs, fractions, super/subscripts, roots, delimiters, n-ary operators like sum/integral) to MathML, which Chromium renders natively with no extra library. Anything outside that subset (matrices, accents, exotic group characters) falls back to flattened plain text in the same slot, so rendering never breaks — it just loses the fancy layout for that one equation.
- Deliberately not attempted: theme colors/fonts/effects, tables and charts (`<p:graphicFrame>`), placeholder-position inheritance from the slide layout/master, and speaker notes (not "on the slide," so not part of the practice text). This is a best-effort layout reconstruction, not a rendering engine — full fidelity would need one (or bundling something like headless LibreOffice), which contradicts staying lightweight.

## Known technical risks

- PDF reading order can be wrong for columns, tables, and unusual layouts.
- PDF files with no text layer need OCR.
- The typing view renders the whole document as individual characters; this is fine for typical documents but could get slow for very large ones (tens of thousands of characters) — virtualization is the fix if that turns out to matter in practice.
- JSON persistence is intentionally temporary and should not be treated as the final database layer.
- The Electron package must keep remote content out of privileged renderer contexts.

## Roadmap

- Scanned PDF OCR.
- Legacy `.doc`, `.odt`, `.rtf`, and EPUB import.
- Image file import.
- PDF preview: extraction correction, page navigation.
- Persisted document-specific WPM/accuracy/session history (currently session-only).
- Import preview before saving; preserve paragraph/page metadata; extraction warnings with editable text.
- SQLite migrations and local result history, replacing the current JSON persistence.
- Document search, rename, and archive in the library.
- Virtualize the typing view's character rendering if large documents prove slow in practice.

## Changelog

### 2026-09-27: PPTX real-layout preview

Replaced the flat "list of extracted images" PPTX preview with an actual slide layout
reconstruction — text and images positioned where they really are (see "PPTX handling in
detail" above). The flat-list version made it impossible to tell which text corresponded to
which image once extracted; this fixes that directly by showing them together, spatially, as
authored.

### 2026-09-27: Continuous whole-document typing

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

### Earlier

Removed `reference/monkeytype` (the old Monkeytype source, kept around briefly for comparison —
2,100+ files and 160+ MB with nothing here depending on it) and the 420-character-passage-era
UX notes (source/typing split view, resizable library sidebar, PDF reference pane) that this
changelog's later entries have since superseded.

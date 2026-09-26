# Document Trainer design and handoff

Updated: 2026-09-25

## Product goal

Create a local desktop application that lets a user choose a document, read it while typing, and resume practice later without sending document content to a server.

The first product boundary is deliberately narrow: local file import and a focused typing environment. Live webpage capture and browser-extension permissions are excluded for now.

## Why the project moved away from Monkeytype

Monkeytype is useful reference material, but its application boundary is an online typing website. Its authentication, remote configuration, result upload, mixed legacy/Solid frontend, and existing custom-text assumptions make it a poor foundation for a local-first desktop product.

The old project was moved, not deleted, to `reference/monkeytype`. The new app owns its document model, persistence, desktop permissions, and typing session lifecycle.

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
  - source reading pane
  - active passage display
  - typing input and progress UI

Renderer document core
  - text/HTML normalization
  - PDF.js extraction
  - passage selection
  - character comparison
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

The renderer divides the remaining normalized text into 420-character passages. The user sees:

- the current passage with the current character marked;
- an optional rendered PDF reference pane containing diagrams and images;
- correct characters in green and incorrect entered characters in red;
- a textarea for typing;
- document progress and a restart action.

Progress is committed when a passage is completed. If the app closes mid-passage, the user may need to repeat that current passage; this is an intentional MVP limitation. The next persistence milestone should store an exact passage offset and partial input safely.

## Supported input

### Implemented now

- `.txt`
- `.md` and `.markdown`
- `.html`, `.htm`, `.xhtml`
- text-based `.pdf`

### Planned

- scanned PDF OCR;
- DOCX;
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
- [x] Passage progress and restart.
- [ ] Exact mid-passage resume.
- [ ] Automated tests.

### Milestone 2: reliable document workflow

- Add preview before saving.
- Preserve paragraph/page metadata.
- Add extraction warnings and editable text.
- Add SQLite migrations and local result history.
- Add document search, rename, and archive.
- Add large-document chunking without loading all text into one DOM tree.

### Milestone 3: broader formats

- Add DOCX extraction with a dedicated parser.
- Add EPUB extraction.
- Add optional OCR worker for scanned documents.
- Add PDF page preview and page navigation.

## Immediate next coding tasks

1. Install dependencies with the existing Node 18 environment.
2. Run typecheck and fix Electron-vite/PDF.js declaration issues.
3. Run the app and manually import a TXT file and a PDF.
4. Add unit tests for normalization and passage boundaries.
5. Implement exact partial-passage resume.
6. Replace JSON persistence with a versioned repository abstraction before adding history.

## Known technical risks

- PDF reading order can be wrong for columns, tables, and unusual layouts.
- PDF files with no text layer need OCR.
- Full source rendering can become expensive for very large documents; the reader pane should eventually virtualize or paginate.
- JSON persistence is intentionally temporary and should not be treated as the final database layer.
- The Electron package must keep remote content out of privileged renderer contexts.

## Handoff status

The current workspace root is the new application. The old Monkeytype source is under reference/monkeytype; its dependency directories were removed because they are reproducible from its lockfiles. No old source files were deleted.

## Implementation status

Completed in the initial vertical slice:

- Electron main/preload/renderer structure.
- Context-isolated desktop API for file picking and local JSON persistence.
- SolidJS library and source/typing split view.
- TXT, Markdown, HTML, and text-based PDF extraction.
- PDF.js worker bundling with scripting disabled.
- Passage-level typing progress and restart.
- Tailwind styling with project-local color tokens.

Validation in the current environment:

- npm run typecheck passes.
- npm run build passes.
- npm run typecheck passes under Node 18.
- npm run build passes under Node 18.
- npm run dev starts Vite under Node 18. Electron may require the Linux chrome-sandbox helper to be owned by root with mode 4755; this is a host permission issue, not a Node requirement.

## UX milestone

The practice screen now highlights the active passage inside the full source document and displays live WPM, accuracy, error count, and document progress. Restarting a document resets the session metrics. The current passage remains a bounded 420-character unit so the full source remains readable without making the input target unwieldy.

## Current UX and extraction milestone

- The extracted source-text pane was removed from the practice workspace.
- The typing workspace is central and wraps long passages without horizontal scrolling.
- The library sidebar can be resized by dragging its divider.
- PDF documents get a separate resizable rendered reference pane. PDF pages, diagrams, and images are visible there but are never part of the typing target.
- PDF preview rereads the original file path saved with newly imported documents. Older records created before sourcePath was added should be removed and re-imported to enable preview.
- Greek letters and common math symbols are normalized into keyboardable English names: pi, beta, alpha, infinity, times, square root, and similar names.
- Symbol conversion is intentionally broad for the MVP; a future parser can make conversion context-sensitive for technical notation.

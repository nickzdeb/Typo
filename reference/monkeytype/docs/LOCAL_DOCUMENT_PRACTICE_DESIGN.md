# Local Document Practice Client

Status: design/feasibility assessment  
Date: 2026-09-25  
Scope: repository scan and proposed architecture; no product code implemented yet

## 1. Executive decision

This project can realistically become the typing engine for a local document-practice client. The existing engine already does the hard real-time work: it accepts characters through a controlled textarea, compares them against an in-memory target, records timestamped input events, calculates WPM/accuracy/error statistics, renders caret/word state, and shows a result screen.

The requested product is larger than a new Monkeytype mode, however. It needs three separate capabilities:

1. Import and normalize text from local files, especially PDFs.
2. Persist documents, extraction results, and resume positions locally.
3. Capture text from browser webpages, which requires an extension/content-script runtime rather than a normal webpage.

Recommended direction: build a shared document-practice core and a dedicated local workspace inside the frontend first. Add a browser-extension package as a second runtime. Keep a desktop shell optional until folder access, native OCR, or unrestricted local-file workflows are proven necessary.

The project should not be converted into a completely separate application immediately. Reuse the tested Monkeytype input/scoring engine, but isolate document-specific loading, normalization, persistence, and UI behind explicit interfaces. This minimizes risk to the existing public typing-test behavior and leaves room for a desktop client later.

## 2. User goal and product boundaries

Primary user flow:

1. User opens a local document or captures a webpage.
2. Client extracts readable text and presents a preview.
3. User chooses the normalization policy and starts/resumes practice.
4. User types the extracted text in order, with normal Monkeytype feedback and statistics.
5. Client saves progress locally and can resume at a document position.
6. User can review document-specific history independently from online Monkeytype account history.

Supported-content expectations need to be explicit:

- Plain text and Markdown: straightforward and should be early MVP targets.
- HTML/webpages: feasible through a browser extension or pasted/imported HTML.
- Text-based PDFs: feasible with PDF.js, but extraction order and whitespace need cleanup.
- Scanned/image-only PDFs: not reliably solvable by PDF text extraction; requires OCR and should be a later optional feature.
- DOCX/EPUB: feasible with additional client-side parsers, but not required for the first milestone.
- Arbitrary binary files: cannot be meaningfully supported without a format-specific extractor.

“Practice on a PDF” should mean both “extract its text for typing” and, eventually, “show the PDF beside the practice surface.” Exact visual reproduction of every PDF is not the same problem as text practice and should not block the first usable release.

## 3. Repository findings

### 3.1 Application shape

This is a pnpm/Turborepo monorepo. The relevant application is frontend/, built with Vite and SolidJS. The frontend is only partially migrated: new UI uses Solid components in .tsx, while the test page and typing engine remain largely imperative TypeScript/DOM code.

Important files:

- frontend/src/ts/index.ts: global application bootstrap. It imports Firebase, database, routing, input listeners, test logic, result handling, and Solid mounts.
- frontend/src/ts/controllers/route-controller.ts: client-side route table. / currently loads the test page.
- frontend/src/ts/pages/test.ts: page lifecycle. Showing or hiding the page calls TestLogic.restart().
- frontend/src/html/pages/test.html: static test DOM. The important elements are #wordsInput, #wordsWrapper, #caret, and #words.
- frontend/src/ts/test/test-logic.ts: test lifecycle (restart, initialization, startTest, finish, result saving).
- frontend/src/ts/test/words-generator.ts: builds target words from language data, quotes, custom text, or Zen mode.
- frontend/src/ts/test/test-words.ts: stores target words. Each word includes its text and a trailing commit character (space, newline, or empty).
- frontend/src/ts/test/test-ui.ts: renders target words/letters, moves the caret, centers lines, and virtualizes/removes word DOM as the test progresses.
- frontend/src/ts/input/listeners/input.ts: handles beforeinput/input and routes insertion/deletion/composition events into the engine.
- frontend/src/ts/input/handlers/insert-text.ts: character validation, event logging, error modes, word navigation, and finish checks.
- frontend/src/ts/test/events/data.ts and frontend/src/ts/test/events/stats.ts: event log and derived statistics.
- packages/schemas/src/results.ts: online result/completed-event schemas. These currently know Monkeytype modes, not document sessions.

### 3.2 Existing custom-text behavior

Custom text is the closest existing feature. frontend/src/ts/test/custom-text.ts stores custom text in localStorage, exposes it as an array of words, and supports repeat/random/shuffle/section/time behavior. words-generator.ts selects CustomText.getText() when Config.mode === "custom".

This is useful precedent, but document practice should not simply be another saved custom-text entry:

- localStorage is a poor store for large documents;
- custom mode may randomize or repeat text;
- custom mode has word/time/section limits that do not model document position well;
- document identity, page/paragraph boundaries, extraction version, and resume offset would be lost;
- the existing result schema is designed for online Monkeytype results.

### 3.3 Existing persistence and backend coupling

Configuration and small custom-text values use schema-validated localStorage. The existing result collection is primarily an authenticated online collection. insertLocalResult is an optimistic in-memory/query-collection insert used after a result has already been accepted by the backend; it is not a general durable local history database.

The app also boots Firebase, fetches server configuration, uses Ape API controllers, emits analytics, and includes a PWA service worker. The PWA cache helps assets load offline, but it does not turn the application into a backend-independent local client. A local mode must make remote services optional at startup and must never attempt to upload document text or local document results by default.

### 3.4 Engine constraints that affect the design

The current engine is a word/commit stream, not a generic arbitrary-text editor:

- TestWords.words stores words with commit characters.
- A normal word receives a trailing space; a line break can be represented by a trailing newline.
- insert-text.ts compares one inserted character to the current target word, then advances on a commit character.
- test-ui.ts renders one word at a time and can append generated words while typing.
- words-generator.ts currently generates an initial batch and may lazily add more words.

This can represent document text if a document adapter preserves a linear character stream and maps separators deliberately. It cannot be assumed that String.split(" ") is sufficient for PDFs: columns, ligatures, non-breaking spaces, hyphenation, page boundaries, and reading order all need normalization before the engine sees the text.

## 4. Runtime feasibility

### 4.1 Normal web app/PWA

A web app can support a user-selected file with a normal <input type="file"> in all practical target browsers. The File System Access API can provide handles and better reopen behavior where available, but showOpenFilePicker() is secure-context-only and not universally available. It must be an enhancement, not the only import path.

The web app can therefore support:

- text/Markdown import;
- PDF import by reading the selected File into an ArrayBuffer;
- local IndexedDB storage for extracted text and session state;
- offline practice after the app assets are installed/cached.

It cannot silently scan arbitrary folders or monitor all files. The user must select files, or a desktop wrapper must provide native filesystem access.

### 4.2 Browser extension

A browser extension is the correct runtime for “practice this webpage.” A content script can read and decorate the page DOM, while a popup, side panel, extension page, or injected overlay owns the practice UI. The content script and extension UI communicate through extension messaging.

Recommended permission posture:

- start with activeTab plus scripting, activated by an explicit toolbar click or command;
- request broad host permissions only if persistent automatic injection is later required;
- keep captured text in the extension/local workspace unless the user explicitly exports it;
- insert text nodes or extension-owned shadow/isolated UI; never evaluate page text as HTML.

Important limitation: browser PDF viewers and privileged browser pages do not accept ordinary content-script injection. A PDF open in the browser’s built-in viewer should be handled by opening/importing its URL or downloaded bytes into the extension’s own PDF.js workspace, subject to browser permission/CORS rules. The extension should not promise that it can modify every built-in PDF viewer.

A normal web build and an extension build should share pure document types and normalization utilities, but should have separate entry points and permission manifests.

### 4.3 Desktop shell

A desktop shell is the long-term answer if “any document on my computer” means folder browsing, persistent file handles, file watching, native OCR, or support for local formats that browsers cannot parse. The current Vite frontend can be hosted in a Tauri/Electron-style shell, but this introduces a new packaging/runtime/toolchain concern. It should be a thin host around the shared frontend, not the first place where document logic is implemented.

## 5. Proposed architecture

### 5.1 Source-adapter boundary

Create a document-practice subsystem with a document source interface similar to:

~~~ts
type DocumentSourceKind = "text" | "pdf" | "webpage";

type DocumentSource = {
  id: string;
  kind: DocumentSourceKind;
  title: string;
  locator?: string; // path, URL, or opaque extension locator
  fingerprint: string;
  extractorVersion: string;
  loadText(): Promise<ExtractedDocument>;
};

type ExtractedDocument = {
  title: string;
  blocks: ExtractedBlock[];
  pageCount?: number;
  warnings: string[];
};

type ExtractedBlock = {
  text: string;
  page?: number;
  kind: "paragraph" | "heading" | "list" | "code" | "unknown";
};
~~~

The exact API can change during implementation; the essential decision is that the typing engine consumes normalized document chunks, not files, DOM nodes, or PDF.js objects.

Suggested modules:

- frontend/src/ts/document-practice/models.ts: document/session/result schemas and discriminated unions.
- frontend/src/ts/document-practice/extractors/text.ts: plain text/Markdown import.
- frontend/src/ts/document-practice/extractors/pdf.ts: PDF.js loading and page text extraction.
- frontend/src/ts/document-practice/normalize.ts: Unicode, whitespace, line, paragraph, and hyphen policies.
- frontend/src/ts/document-practice/store.ts: IndexedDB repository.
- frontend/src/ts/document-practice/session.ts: document cursor, chunk loading, resume state.
- frontend/src/ts/document-practice/engine-source.ts: adapter from a document session to the existing word generator/test engine.
- frontend/src/ts/components/pages/documents/: library/import/preview UI.
- frontend/src/ts/components/pages/document-practice/: practice workspace and progress UI.

If the extension is added, move pure models/normalization into a small package such as packages/document-core/, then import it from both frontend and extension/. Keep PDF.js worker/browser wiring in the runtime that owns the PDF viewer.

### 5.2 Do not add mode: "document" to online result schemas initially

The first implementation should use a separate local document-session state and a document-specific local result record. The existing Monkeytype Mode and CompletedEventSchema are consumed by the backend and many account/statistics paths. Adding a new server mode would require coordinated backend, contracts, result filters, account charts, leaderboards, migrations, and validation changes.

The document engine can still reuse the current event log and result UI. Internally, it can expose a local “linear source” to the test lifecycle while marking the result sink as local. A local result may contain the normal WPM/accuracy fields plus:

- document ID/fingerprint;
- source kind/title/locator;
- extractor and normalization versions;
- start/end character offsets;
- page/paragraph range;
- session ID and resume position;
- whether OCR or extraction warnings were present.

Do not send this record, raw extracted text, or a local path to the Monkeytype backend by default. If online sync is ever wanted, define a separate opt-in contract after the local model stabilizes.

### 5.3 Engine integration strategy

Implement a PracticeTextSource abstraction at the boundary currently occupied by language/quote/custom generation. The first adapter may be a linear document adapter that returns ordered tokens/chunks and appendCommitCharacter semantics, but it should not route through custom-text randomization.

Required engine changes:

1. Add a document-session check to test initialization before language/quote generation.
2. Reset and restore a document cursor during restart/resume.
3. Ask the source for the next chunk when addWord() needs more target text.
4. Preserve exact target characters after normalization; do not apply language punctuation, British-English conversion, random word selection, numbers, or funboxes unless explicitly supported for documents.
5. Finish when the document cursor reaches the selected end range, not when a generated word count happens to end.
6. Route result saving through a local result sink for document sessions so Ape.results.add() is not called.
7. Keep existing TestWords, input events, caret, replay, and stats working wherever possible.

A lower-risk MVP can initially materialize a bounded normalized document range into the existing word list. This is suitable for a selected page or short article. Before supporting book-length documents, replace that with a chunked source because the current engine’s eager word array and DOM history are not designed for unbounded input.

### 5.4 Text normalization policy

Normalization must be visible and reproducible. Store the policy with every extracted document/session. Proposed policy options:

- Unicode normalization: default NFC; never silently discard non-ASCII characters.
- Whitespace: collapse repeated horizontal whitespace; preserve paragraph boundaries.
- Newlines: convert CRLF/CR to LF; choose whether a page break becomes one or two newlines.
- Hyphenation: optionally join line-ending hyphenated words, with a preview warning because this can change meaning.
- Ligatures: map common presentation ligatures only when the extractor exposes them as compatibility glyphs.
- Headers/footers: optional repeated-line removal for PDFs, always previewable.
- Code blocks: preserve whitespace and tabs when the user selects “code-preserving.”
- Punctuation: preserve source punctuation by default; no Monkeytype-generated punctuation.

The preview must show the normalized text and warnings before practice begins. A bad extraction is a content problem, not a typing-engine problem, so users need a way to inspect or edit the practice text.

### 5.5 PDF design

Use PDF.js as the first PDF implementation. For each page, call PDF.js text-content APIs, collect text items, and convert their coordinates into an ordered block/line model. Do not blindly concatenate returned items: PDF internal ordering can be unsuitable for human reading order, especially with columns and complex layouts.

PDF MVP:

- user selects a local PDF;
- PDF.js worker extracts text page by page;
- client sorts/groups text items using transform coordinates and conservative line-gap heuristics;
- user sees extraction warnings and a text preview;
- practice uses normalized page text;
- page number/progress is stored.

Later PDF workspace:

- render the current PDF page beside the practice surface using PDF.js canvas/text layers;
- highlight the current extracted block where mapping is reliable;
- allow “practice page,” “practice selection,” and “practice remaining document.”

Scanned PDFs need OCR. Keep OCR behind an optional adapter and only enable it after measuring bundle size, worker performance, language-pack storage, and privacy implications. A desktop OCR path may be more practical than forcing all OCR into the browser.

### 5.6 Local persistence

Use IndexedDB for document records, extracted chunks, session cursors, and local document results. The frontend already depends on idb, but no current general document repository exists.

Suggested stores:

- documents: metadata, fingerprint, source kind, locator, extraction version, normalization policy, warnings, last-used timestamp.
- documentChunks: document ID, sequence, page/block metadata, normalized text.
- documentSessions: document ID, current offset/chunk, selected range, status, timestamps.
- documentResults: local result metrics and document range metadata.
- documentSettings: user preferences such as whitespace policy and auto-resume.

Do not depend on persisted FileSystemFileHandle for correctness. It can be an optional convenience for reopening a file, but browsers may revoke permission or not support the API. The extracted normalized content and fingerprint should be sufficient to resume a prior session.

Raw file bytes should not be retained by default. If storing them is later useful for offline PDF re-rendering, make it an explicit setting and explain that local browser storage is not encryption. Never upload raw documents implicitly.

### 5.7 UI and routes

Add a dedicated SolidJS workspace rather than forcing document state into the existing test configuration modal:

- /documents: document library, import buttons, recent/resumable sessions, delete/export controls.
- /documents/import: file picker, webpage capture handoff, extraction progress, preview, normalization settings.
- /documents/:id/practice: split workspace with source viewer/preview, practice text, progress, pause/resume, restart-range controls.

The existing / test page remains the normal Monkeytype test. A document session can reuse the same result/stat components where practical, but should have a document-specific header and progress indicator.

For webpage practice, the extension may offer:

- “Practice selection” from user-selected text;
- “Practice article” using readable-content extraction;
- “Open in practice workspace” in the extension page;
- optional in-page overlay for users who want to keep the webpage visible.

Start with “open in workspace.” An overlay has more focus, scroll, z-index, CSS isolation, accessibility, and page-compatibility failure modes.

## 6. Browser-extension design

Proposed extension layout:

~~~text
extension/
  manifest.json
  src/background.ts
  src/content-script.ts
  src/popup/...
  src/sidepanel/...
  src/messages.ts
~~~

Flow:

1. User clicks the extension action.
2. Background/service-worker code injects or messages the content script for the active tab.
3. Content script extracts selected/readable text and sends a serializable payload.
4. Extension workspace stores the payload locally and opens the practice route.
5. Optional overlay messages only UI state; it does not grant the webpage access to extension APIs.

Security rules:

- treat all page text and URLs as untrusted input;
- render captured text as text, never as HTML;
- validate message schemas at the boundary;
- avoid postMessage bridges unless necessary;
- do not capture passwords, editable fields, hidden text, or whole-page content without explicit user action;
- use least-privilege permissions and explain them in onboarding.

This runtime should share the document normalization code but not import the whole Monkeytype bootstrap, because frontend/src/ts/index.ts assumes the normal site DOM, Firebase, routing, ads, and backend lifecycle.

## 7. Local/offline runtime changes

Add a runtime capability/configuration layer rather than scattering localMode checks:

~~~ts
type RuntimeCapabilities = {
  localDocuments: boolean;
  onlineAccount: boolean;
  analytics: boolean;
  ads: boolean;
  extensionBridge: boolean;
};
~~~

The local build should:

- boot without Firebase credentials;
- skip server-configuration and account-dependent initialization;
- disable analytics and ads;
- never block document practice on an API promise;
- use local result/session repositories;
- retain the normal online behavior when built/configured as the public site.

The current PWA/service-worker configuration can remain useful for asset caching, but offline document practice needs explicit IndexedDB data and offline UI states. Service-worker caching alone is not the document database.

## 8. Delivery phases

### Phase 0: spike and contracts

- Add pure document/session/result types and normalization tests.
- Collect representative fixtures: plain text, Markdown, single-column PDF, multi-column PDF, scanned PDF, HTML article, code-heavy webpage.
- Verify PDF.js worker bundling and memory behavior.
- Prototype a linear source that feeds a short normalized string into the current engine.
- Decide exact paragraph/page-break semantics from fixture output.

Exit criterion: a fixture can be normalized deterministically and typed through the current validation loop without changing online test behavior.

### Phase 1: local text + text-based PDF MVP

- Add IndexedDB repository and document library.
- Add local text/Markdown import.
- Add PDF.js text extraction for user-selected PDFs.
- Add preview/warnings/normalization settings.
- Add document practice route and bounded range practice.
- Save/resume local sessions and local document results.
- Make local runtime independent of Firebase/API availability.

Exit criterion: user can close/reopen the app and resume a local text or text-based PDF practice session entirely offline.

### Phase 2: long documents and PDF workspace

- Replace bounded materialization with chunked source loading.
- Add page/paragraph range selection.
- Render PDF page beside the practice surface.
- Map progress back to page/chunk where reliable.
- Add local history/search/export.

Exit criterion: a book-length text PDF can be practiced without loading all target DOM/text at once, and resume position remains correct after restart.

### Phase 3: webpage extension

- Add extension build/package and message schemas.
- Implement selection capture first.
- Add readable-content extraction fallback.
- Open captured content in the shared practice workspace.
- Add optional side panel/overlay only after workspace flow is stable.

Exit criterion: user can click the extension on an ordinary webpage, choose the content, and practice it without granting unnecessary permanent host access.

### Phase 4: format/OCR/desktop expansion

- DOCX/EPUB adapters.
- Optional OCR worker and language packs.
- Optional Tauri/Electron shell for folder access and native integrations.
- Optional opt-in sync/export.

These are independent expansions. They should not delay the core local text/PDF experience.

## 9. Main risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| PDF reading order is wrong | User practices scrambled text | Coordinate-aware ordering, preview, warnings, fixture tests, editable normalized text |
| Scanned PDF has no text layer | Empty extraction | Detect low/zero text, offer OCR later, clearly explain limitation |
| Existing generator applies randomization | Document order is lost | Dedicated linear source; do not overload custom random/repeat behavior |
| Existing result save calls backend | Privacy leak / failures offline | Document session selects local result sink; add tests that Ape is not called |
| Very large document | Memory/UI degradation | IndexedDB chunks, bounded target window, lazy extraction/rendering |
| Browser extension permissions | Privacy and store-review risk | activeTab/explicit gesture first; optional host permissions only later |
| Built-in PDF viewer is privileged | Extension cannot inject there | Import/open with extension-owned PDF.js workspace; document limitation |
| Page CSS/scripts interfere with overlay | Broken webpages or security issue | Prefer extension page/side panel first; shadow/isolated UI and text-only rendering |
| Frontend bootstrap assumes online site | Local app fails before route loads | Runtime capabilities and optional remote initialization |
| Schema drift | Future resume failures | Persist extractor/normalizer versions and migrations |
| OCR bundle size/privacy | Slow or surprising behavior | Optional worker/language pack; explicit opt-in; desktop alternative |

## 10. Testing and verification plan

Follow repository conventions: targeted tests use pnpm vitest run path/to/test.ts; frontend lint/type checks follow the repository instruction (oxlint --type-aware --type-check, with --format agent when invoking lint directly).

Add unit tests for:

- newline/CRLF/whitespace normalization;
- Unicode normalization and ligature policy;
- hyphenation and page-break policy;
- PDF text-item ordering using small fixtures;
- deterministic fingerprints and schema migrations;
- document cursor/chunk boundaries;
- resume after a word boundary and mid-word if supported;
- extension message validation and hostile text treated as plain text.

Add integration tests for:

- text source through WordsGenerator/TestWords into character validation;
- finish at exact document end;
- restart/resume not duplicating or skipping characters;
- local result path not invoking Ape.results.add;
- offline boot without Firebase/API configuration;
- webpage selection payload into the workspace.

Manual acceptance cases:

- punctuation-heavy prose;
- multiple paragraphs and blank lines;
- multi-column PDF;
- PDF with ligatures and hyphenated line wrapping;
- PDF with no text layer;
- very long document;
- ordinary webpage with nav/ads/comments;
- restricted browser page and built-in PDF viewer;
- offline after a fresh app install.

## 11. Design decisions summary

1. Preserve the existing typing engine and event model. It already provides valuable behavior and test coverage.
2. Add a first-class document source/session layer instead of treating documents as ordinary custom text.
3. Keep document results local and separate from online Monkeytype schemas initially.
4. Use IndexedDB, not localStorage, for extracted content and progress.
5. Use PDF.js for text-based PDFs; make extraction quality visible and do not promise scanned-PDF support in MVP.
6. Build webpage support as a browser extension with explicit user action and least privilege.
7. Prefer an extension workspace/side panel before an in-page overlay.
8. Make remote services optional through runtime capabilities.
9. Keep a desktop shell as a future host for unrestricted filesystem/OCR needs, not as a prerequisite for the first browser MVP.
10. Version extraction and normalization so future parser changes do not silently invalidate resume offsets.

## 12. Final feasibility assessment

The project is a good foundation. A local text/PDF practice MVP is realistic without rewriting Monkeytype. The main implementation work is integration and data modeling, not reimplementing typing statistics.

A polished “any document + webpage + PDF viewer + OCR + unrestricted filesystem” product is a medium-to-large extension of the project and should be treated as a product subsystem with multiple runtimes. It is still realistic if delivered in phases. The recommended next coding task is Phase 0: introduce the pure document source/normalization contracts, test them with PDF/text fixtures, and prove one short linear document can run through the current engine.

## 13. Platform references

- MDN File System API: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- MDN showOpenFilePicker(): https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker
- MDN WebExtension content scripts: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
- Chrome extension permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome activeTab permission: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- PDF.js PDFPageProxy.getTextContent() API: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html


## 14. Implementation status (2026-09-25)

The first vertical slice is implemented in the frontend.

### Implemented

- Added pdfjs-dist 6.3.289 to frontend/package.json. PDF JavaScript execution is explicitly disabled when loading a document; the worker is loaded through Vite's ?url import.
- Added document contracts in frontend/src/ts/document-practice/types.ts. LocalDocument stores extracted text, source metadata, warnings, timestamps, and a content fingerprint. DocumentKind already includes webpage for the later extension/workspace phase.
- Added normalization and conversion in normalize.ts. This normalizes CRLF, non-breaking/zero-width spaces, tabs, trailing whitespace, and blank lines, then converts paragraph lines into the existing custom-text word stream while retaining newline markers.
- Added IndexedDB persistence in store.ts. Database is monkeytype-document-practice version 1; object store is documents, keyed by id and indexed by updatedAt. It supports list, get, save, mark-practiced, and delete.
- Added import/extraction in extractors.ts. Plain text and Markdown are read as text. HTML is parsed with DOMParser; script/style/noscript/SVG nodes are removed. Text-based PDF pages are extracted with PDF.js and ordered using page coordinates. Pages without a text layer produce an OCR warning.
- Added /documents route and Solid page. Users can import supported files; content remains in browser-local IndexedDB; the page shows kind, word count, PDF page count, extraction warnings, practice, and delete actions.
- Connected document practice to the existing typing test. practice.ts loads normalized words into Monkeytype's custom-text engine in repeat/word-limit mode. Completion does not upload to Ape, write a normal signed-out result, or emit normal no-login completion analytics.
- Added /documents to the Firebase hosting rewrite.

### Deliberate MVP shortcut

The current practice adapter uses the existing custom-text engine rather than the planned first-class DocumentSource engine. This preserves Monkeytype's current character validation, caret, timer, and result UI, but means:

- the entire extracted document is loaded into the current custom-text setting;
- every practice action starts at the beginning;
- a cursor/offset is not persisted;
- local document-specific WPM/accuracy/history records are not stored;
- very short sources inherit existing custom-mode validity rules;
- the result screen still describes the source as custom text internally.

This is acceptable for the first vertical slice, but a document session/source layer is required before claiming full resume support or large-document support.

## 15. Current verification

Executed:

- Frontend TypeScript checker: feature code passes; one unrelated repository error remains because the ignored generated file frontend/src/ts/constants/firebase-config.ts is absent.
- Focused Vitest was attempted, but cannot start in Node 18.19.1. The repository requires Node 24 and the installed Rolldown/Vitest stack imports node:util.styleText, unavailable in Node 18.
- Required Oxlint was attempted with --format agent, but the installed package is missing its native Linux optional binding.
- Vite build was attempted, but Vite 8 requires Node 20.19+ and this environment is Node 18.

A future agent should rerun in Node 24:

~~~sh
pnpm vitest run frontend/__tests__/document-practice/normalize.spec.ts
pnpm oxlint --type-aware --type-check --format agent
pnpm vite build --mode development
~~~

If native optional bindings are still missing, reinstall dependencies on the target platform.

## 16. Next implementation steps

1. Add DocumentSource and DocumentSession abstractions. Store document id, normalization/extractor versions, current word/character offset, and completion state separately from source text.
2. Add a local result store for WPM, accuracy, errors, duration, completion time, and source fingerprint. Add document history without sending data to Monkeytype's server.
3. Replace whole-document custom-text loading with chunked/lazy text while preserving exact character boundaries across chunks and page breaks.
4. Add PDF fixtures/tests for normal single-column, multi-column, ligatures, hyphenation, and scanned/no-text pages.
5. Add a preview/edit step so users can correct bad PDF reading order.
6. Add optional OCR in a worker with explicit opt-in.
7. Implement webpage capture as a separate browser extension package: content script, user gesture, visible/article text extraction, plain-text message validation, and side-panel/workspace mode.
8. Make Firebase and remote configuration optional for offline local practice.
9. Add desktop packaging only after browser/extension boundaries are proven; keep Tauri/Electron as a host layer, not a typing-engine rewrite.

## 17. Files changed by the implementation slice

- frontend/package.json
- pnpm-lock.yaml
- frontend/firebase.json
- frontend/src/index.html
- frontend/src/ts/pages/page.ts
- frontend/src/ts/pages/documents.ts
- frontend/src/ts/components/mount.tsx
- frontend/src/ts/components/pages/DocumentsPage.tsx
- frontend/src/ts/components/layout/header/Nav.tsx
- frontend/src/ts/controllers/page-controller.ts
- frontend/src/ts/controllers/route-controller.ts
- frontend/src/ts/test/test-logic.ts
- frontend/src/ts/document-practice/types.ts
- frontend/src/ts/document-practice/normalize.ts
- frontend/src/ts/document-practice/store.ts
- frontend/src/ts/document-practice/extractors.ts
- frontend/src/ts/document-practice/state.ts
- frontend/src/ts/document-practice/practice.ts
- frontend/__tests__/document-practice/normalize.spec.ts

The earlier sections remain the product/design rationale. This status section is authoritative for what is implemented versus planned.

# Document Trainer

Offline desktop typing practice for documents stored on the local machine.

## Current scope

- Electron desktop shell.
- Local document library persisted under Electron's user-data directory.
- Plain text, Markdown, HTML, and text-based PDF import.
- PDF text extraction through PDF.js with document scripting disabled.
- Side-by-side source reading and passage typing.
- Passage-completion progress and restart support.

This app does not upload document content. Browser extensions, live webpages, OCR, DOCX, EPUB, and polished statistics are intentionally outside the first milestone.

## Development

The project supports Node 18 and npm. From this directory:

```sh
npm install
npm run typecheck
npm run dev
```

Build the desktop bundle with `npm run build`.

## Reference material

The previous Monkeytype project is preserved in [reference/monkeytype](./reference/monkeytype). It is not part of the new build. Its typing behavior and earlier document prototype are available for comparison only.

See [docs/DESIGN.md](./docs/DESIGN.md) for architecture, decisions, milestones, and future work.

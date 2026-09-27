# Project instructions

- Keep communication concise.
- This is a standalone Electron + SolidJS desktop app. There is no legacy/reference project in this repo — everything under `src/` and `electron/` is the current app.
- UI uses TSX and Tailwind CSS. Use class attributes, the `cn` utility, and the color tokens in `tailwind.config.cjs` (which resolve to CSS variables set by `src/renderer/src/core/theme.ts`, not fixed hex values). Do not use `classList`.
- Keep the renderer context-isolated (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) and avoid exposing raw filesystem or IPC APIs from `electron/preload.ts` — add a narrow, named function per capability instead.
- Run `npm run typecheck`, `npm run test`, and `npm run build` after changes.
- Prefer focused unit tests (`*.test.ts` next to the module, run by vitest) for pure logic: document normalization, extraction, and typing-session math. UI components don't need unit tests.
- Color utilities with an opacity modifier (`bg-error/30`) depend on `core/theme.ts` setting CSS variables as space-separated `R G B`, not hex — see the "Theme opacity bug" note in `docs/DESIGN.md` before changing either.

## Where things live

- `electron/main.ts` — main process: file picker, JSON document persistence under Electron's userData dir, IPC handlers. `electron/preload.ts` mirrors each handler as a typed `window.desktopApi` function.
- `src/shared/types.ts` — types shared between main and renderer (`DocumentRecord`, `DesktopApi`, ...). Add new IPC surface here first.
- `src/renderer/src/core/` — pure, framework-free logic: `extract.ts` (file → text per format), `normalize.ts` (text cleanup), `theme.ts` (color presets/CSS vars), `pptx.ts` (slide text/images/equations), `omml.ts` (equation markup → MathML, used only by `pptx.ts`). This is where most "add a feature" work belongs, and it's the easiest code to unit test.
- `src/renderer/src/components/` — Solid UI components (`PdfPreview.tsx`, `PptxPreview.tsx`, `ThemeSettings.tsx`, `VirtualKeyboard.tsx`, ...). A format with non-typable visual content (images, equations, diagrams) gets its own `<Kind>Preview.tsx`, shown in the same reference-only side pane pattern as PDF/PPTX — see `hasSlideOrPagePreview` in `App.tsx`.
- `src/renderer/src/App.tsx` — top-level layout and session state (library, typing cursor/results, typing metrics, resizable panes).

## Adding a feature (common cases)

- **New importable file format:** add a detector + extractor function in `core/extract.ts`, extend `isPdf`/`isHtml`/`isPlainText`-style checks, add the extension to the file-picker filter in `electron/main.ts`.
- **New theme:** add an entry to the `presets` array in `core/theme.ts` — the settings UI picks it up automatically.
- **New IPC capability:** add the handler in `electron/main.ts`, expose it in `electron/preload.ts`, add its type to `DesktopApi` in `src/shared/types.ts`.

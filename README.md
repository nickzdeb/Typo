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

## Installing the app (no terminal required)

Go to the [Releases page](https://github.com/nickzdeb/Typo/releases) and download the file for your operating system:

- **Mac:** download the `.dmg`, open it, then drag **Document Trainer** into Applications. The first time you open it, macOS will say it's from an unidentified developer — right-click (or Control-click) the app and choose **Open**, then confirm. You only need to do this once.
- **Windows:** download the `.exe` installer and run it. Windows SmartScreen may show a warning because the app isn't code-signed yet — click **More info**, then **Run anyway**.
- **Linux:** download the `.AppImage` (make it executable and double-click or run it) or the `.deb` (double-click to install through your package manager).

New builds are produced automatically for all three platforms whenever a version is tagged — see [Releasing](#releasing) below.

## Development

The project supports Node 18+ and npm. From this directory:

```sh
npm install
npm run typecheck
npm run test
npm run dev
```

Build the desktop bundle (without packaging an installer) with `npm run build`.

### Packaging an installer locally

```sh
npm run dist:mac    # .dmg and .zip, mac only
npm run dist:win     # .exe installer and portable .exe
npm run dist:linux   # .AppImage and .deb
```

Cross-compiling for another OS from your current machine is unreliable (Windows/Linux builds on a Mac, etc.), so use these mainly for building the platform you're already on. Output lands in `release/`.

### Releasing

Push a tag starting with `v` (e.g. `v0.2.0`) and GitHub Actions builds installers for Mac, Windows, and Linux and attaches them to a new GitHub Release automatically. You can also trigger a build without releasing from the Actions tab (`Build desktop app` → `Run workflow`).

## Reference material

The previous Monkeytype project is preserved in [reference/monkeytype](./reference/monkeytype). It is not part of the new build. Its typing behavior and earlier document prototype are available for comparison only.

See [docs/DESIGN.md](./docs/DESIGN.md) for architecture, decisions, milestones, and future work.

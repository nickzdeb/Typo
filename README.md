# Typo

Offline desktop typing practice for your own documents (.txt, .md, .html, .docx, .pptx, PDF). Everything stays on your computer — no upload, no account.

## Install

Download from [Releases](https://github.com/nickzdeb/Typo/releases):

- **Mac:** `.dmg` → drag into Applications → first launch, right-click the app → **Open** (bypasses the one-time "unidentified developer" warning).
- **Windows:** `.exe` → run it → **More info** → **Run anyway** (SmartScreen warning, since the build isn't code-signed).
- **Linux:** `.AppImage` (run directly) or `.deb` (install via your package manager).

## Develop

```sh
npm install
npm run dev        # launch the app
npm run test        # unit tests
npm run typecheck
npm run build       # production bundle, no installer
```

`npm run dist:mac` / `dist:win` / `dist:linux` package an installer for the platform you're currently on (cross-compiling to another OS isn't reliable). Push a tag like `v0.2.0` and GitHub Actions builds and releases installers for all three platforms automatically.

## Contributing

[AGENTS.md](./AGENTS.md) has the file map and "how do I add X" recipes. [docs/DESIGN.md](./docs/DESIGN.md) has the architecture, feature details, and design decisions.

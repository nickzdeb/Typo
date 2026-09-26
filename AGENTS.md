# Project instructions

- Keep communication concise.
- This is a standalone Electron + SolidJS desktop app; the old Monkeytype project lives under reference/monkeytype.
- New UI uses TSX and Tailwind CSS. Use class attributes, the cn utility, and project colors from tailwind.config.cjs. Do not use classList.
- Keep the renderer context-isolated and avoid exposing raw filesystem or IPC APIs.
- Run npm run typecheck and npm run build after changes.
- Prefer focused tests for document normalization, extraction, and typing-session behavior.

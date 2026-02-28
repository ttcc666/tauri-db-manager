# Repository Guidelines

## Project Structure & Module Organization
The app is split into a web UI and a Tauri backend.

- `src/`: React + TypeScript frontend. Main UI lives in `App.tsx`; shared types are in `types.ts`.
- `public/`: static assets served by Vite.
- `src-tauri/src/`: Rust backend. Tauri commands and file I/O logic are in `lib.rs`; `main.rs` is the entrypoint.
- `src-tauri/tauri.conf.json`: app/window/build configuration.
- `src-tauri/capabilities/`: Tauri capability definitions.
- Build outputs: `dist/` and `src-tauri/target/` (generated; do not edit).

## Build, Test, and Development Commands
Use `pnpm` in the repository root.

- `pnpm install`: install JS dependencies.
- `pnpm dev`: run the frontend dev server.
- `pnpm tauri dev`: run the desktop app with Tauri + frontend dev server.
- `pnpm build`: TypeScript compile check and production frontend build.
- `pnpm tauri build`: build desktop bundles.
- `cd src-tauri && cargo test`: run Rust tests (when tests exist).

## Coding Style & Naming Conventions
- TypeScript/React: follow existing style in `src/` (2-space indent, semicolons, double quotes).
- Rust: follow standard Rust style (4-space indent, `snake_case` for functions, `CamelCase` for types).
- Naming: React components use `PascalCase`; variables/functions use `camelCase`.
- Keep serialization contracts stable: Rust structs use `serde` with `camelCase` mapping for frontend compatibility.
- Keep functions focused and small; extract repeated logic instead of copying.

## Testing Guidelines
There is no dedicated JS test framework configured yet. For now:

- Perform manual smoke checks via `pnpm tauri dev`:
  - load a JSON path
  - create/update/delete an entry
  - verify JSON preview updates correctly
- Add Rust unit tests in `src-tauri/src/lib.rs` for new parsing/normalization logic.
- Include test steps and results in each PR description.

## Commit & Pull Request Guidelines
Current history uses concise, descriptive commit subjects (example: `Initial commit: ...`).

- Prefer short, imperative commit messages; optionally prefix scope (`frontend:`, `tauri:`).
- PRs should include:
  - what changed and why
  - how it was tested (commands + outcomes)
  - screenshots/GIFs for UI changes
  - linked issue/task when available

## Security & Configuration Tips
- Never commit real credentials or production connection strings.
- Keep sensitive values in local files/environment, not tracked files.
- When adding new native capabilities, update `src-tauri/capabilities/` with least-privilege access.

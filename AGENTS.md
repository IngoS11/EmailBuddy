# Repository Guidelines

## Project Structure & Module Organization
This repository is currently uninitialized (no committed source files yet). Use this baseline structure as code is added:
- `src/`: application/source code grouped by feature or domain.
- `tests/`: automated tests mirroring `src/` paths.
- `assets/`: static files (images, templates, sample data).
- `docs/`: design notes, architecture decisions, and runbooks.

Keep modules small and cohesive. Prefer feature-oriented folders (for example, `src/email/` and `src/auth/`) over large utility dumps.

## Build, Test, and Development Commands
No build system is configured yet. After selecting a stack, add scripts and keep them consistent with this pattern:
- `npm run dev` (or equivalent): start local development mode.
- `npm test`: run the full automated test suite.
- `npm run lint`: run static checks and style rules.
- `npm run build`: produce production artifacts.

Document any non-Node alternatives in this file (for example, `make test` or `pytest`).

## Coding Style & Naming Conventions
- Indentation: 2 spaces for JS/TS/JSON/YAML; 4 spaces for Python.
- File names: use `kebab-case` for files, `PascalCase` for classes/components, and `camelCase` for variables/functions.
- Keep functions focused and side effects explicit.
- Enforce formatting/linting with project tooling (for example, Prettier + ESLint, or Black + Ruff).

## Testing Guidelines
- Place tests under `tests/` and mirror source paths.
- Name tests clearly (examples: `email-service.test.ts`, `test_email_service.py`).
- Cover new logic and bug fixes with tests before merging.
- Aim for meaningful coverage on core paths; avoid brittle snapshot-only testing.

## Commit & Pull Request Guidelines
Because there is no Git history yet, adopt Conventional Commits from the start:
- `feat: add SMTP connection manager`
- `fix: handle missing sender address`
- `chore: configure linting`

Pull requests should include:
- concise problem/solution description,
- linked issue (if available),
- test evidence (command output),
- screenshots/log samples when UI or behavior changes.

## Security & Configuration Tips
Never commit secrets. Store credentials in local env files (for example, `.env`) and provide a committed `.env.example` with placeholder values.

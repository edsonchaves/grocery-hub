# grocery-hub

Self-hosted household grocery app: shared shopping list, pantry status, receipt import, restock suggestions, spending insights. Phone-first PWA for every member of the household.

## Workflow

Spec-driven via OpenSpec (`openspec/`). Read the active change's `design.md` before coding; implement with `/opsx:apply`, tick tasks in `tasks.md` as they land.

## Stack

- SvelteKit (TypeScript, adapter-node) serving UI + API in one process
- SQLite (better-sqlite3, WAL) + Drizzle migrations; DB and receipt files under `DATA_DIR` (`/data` in container)
- Live list sync over SSE
- Receipt parsing behind `ReceiptParser`: REWE eBon PDF (deterministic) and photos (vision LLM, Anthropic API, model from env)
- Money as integer cents
- Vitest for unit/spec scenarios, Playwright for e2e

## Deployment

This repo builds and publishes the Docker image (GitHub Actions → ghcr). Running it is done by a separate home-server compose stack, which expects:
- volume at `/data`
- `GET /api/health` for the healthcheck
- `GET /api/widget` (token-protected) for a Homepage `customapi` widget
- config only via env vars (`DATA_DIR`, `PUBLIC_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `TZ`)

## Conventions

- Spec scenarios (`#### Scenario`) map to tests.
- Comments only for non-obvious "why".
- Commits: short one-line imperative messages.

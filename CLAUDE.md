# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Project Management MVP: sign-in-gated Kanban board (Next.js frontend served
as static export by a FastAPI backend) with SQLite persistence and an AI chat
sidebar (via OpenRouter) that can read and modify the board. Full business
requirements, technical decisions, and coding standards are in root
`AGENTS.md` — read it first. The build was done in 10 tracked parts; the full
history, rationale, and every design decision made along the way is in
`docs/PLAN.md` — check it before assuming *why* something was built a certain
way.

Per-directory `AGENTS.md` files (`backend/AGENTS.md`, `frontend/AGENTS.md`,
`scripts/AGENTS.md`) are the authoritative, up-to-date description of each
area's code and must be kept current when that area changes.

## Commands

Backend (from `backend/`):
- `uv sync` — install deps
- `uv run uvicorn app.main:app --reload` — run locally
- `uv run pytest` — run all tests (includes live OpenRouter tests requiring
  `OPENROUTER_API_KEY` in `.env` and network access — `test_ai.py`,
  `test_chat.py::test_chat_live_add_card_to_backlog`)
- `uv run pytest tests/test_board.py::test_name` — run a single test

Frontend (from `frontend/`):
- `npm run dev` — Next.js dev server
- `npm run build` — static export to `frontend/out/`
- `npm run test` / `test:unit` — Vitest unit/component tests
- `npm run test:e2e` — Playwright against `next dev`, all `/api/*` mocked (fast)
- `npm run test:e2e:full` — Playwright against a real built Docker container
  (no mocks, live AI call); equivalent to `scripts/test-e2e-full.sh` from the
  repo root
- `npm run test:all` — lint + unit + mocked e2e (not the full-stack suite)
- `npm run lint`

Docker (from repo root):
- `scripts/start.sh` / `start.bat` — build image, run container on port 8000,
  `.env` passed via `--env-file`
- `scripts/stop.sh` / `stop.bat` — remove the running container

Local dev needs the frontend build copied into the backend manually (Docker
does this automatically via a multi-stage build):
```
cd frontend && npm run build
rm -rf ../backend/app/static/* && cp -r out/. ../backend/app/static/
```

## Architecture

**Request flow / serving model:** FastAPI serves both the API and the
frontend from one process. API routes are registered first, then
`app/static/` (the Next.js static export) is mounted at `/` — route
registration order matters, since routes defined before a mount take priority
over it. There is no Node server at runtime, in Docker or otherwise.

**Auth:** A single hardcoded user (`user`/`password`, `backend/app/auth.py`)
gated by a signed session cookie (Starlette `SessionMiddleware`, secret
regenerated on every process start, so sessions never survive a restart —
acceptable for this single-user MVP). All board and chat routes depend on
`get_current_username`. On the frontend, `src/app/page.tsx` is a three-state
gate (`loading` → renders nothing, even in the static prerender, so board
content never flashes → `anonymous` → `authenticated`) driven by `GET
/api/me`.

**Data model:** SQLite (`backend/app/db.py`), schema in `docs/schema.json` /
`docs/database.md`. `init_db()` creates tables and seeds the hardcoded user +
one board + columns/cards on first run if empty. IDs are DB integers
internally, exposed to the frontend as opaque strings (`"col-3"`, `"card-12"`)
via `column_ref`/`card_ref`/`parse_ref` in `app/board.py`. "One board per
user" is an app-level convention, not schema-enforced (no `UNIQUE` on
`boards.user_id`), so it needs no migration if that changes later.

**Frontend state:** No context/state library. `BoardData` lives in
`KanbanBoard.tsx`, fetched via `src/lib/api.ts` and passed down as props.
`board.cards` is a `Record<id, Card>`; `board.columns` holds ordered
`cardIds` arrays. Pure board-mutation logic (e.g. `moveCard` for drag-and-drop
reordering) lives in `src/lib/kanban.ts`, kept separate from components so
it's unit-testable without rendering.

**Persistence strategy is deliberately non-uniform** (see `frontend/AGENTS.md`
Persistence section): typing a column title or dragging a card updates local
state immediately with the API call firing in the background (needs instant
feedback); add/delete card `await` the API first (add needs the
server-assigned id; click latency is imperceptible). Don't "fix" this into
one uniform pattern — it's intentional.

**AI chat (`app/ai.py`, `app/chat.py`):** OpenRouter via the `openai` SDK
(OpenAI-API-compatible `base_url`), model `openai/gpt-oss-120b`, 30s timeout.
`POST /api/chat` takes `{message, history}` — conversation history is
entirely client-owned/stateless on the backend (the frontend already needs it
in React state to render the transcript, so it's resent each turn rather than
adding backend storage). The LLM call uses Structured Outputs
(`client.chat.completions.parse`) against a `ChatReply` Pydantic model
(`reply: str` + `operations: list[Operation]`). Operations are applied by
calling `app/board.py`'s route functions directly (not over HTTP) with
constructed request models — same persistence/validation code as the regular
CRUD routes. A malformed or nothing-referencing operation raises
`HTTPException`, which `_apply_operation` catches and drops silently rather
than failing the whole chat request. The frontend (`ChatSidebar.tsx`) always
calls `onBoardUpdate` with whatever board the response returns rather than
trying to detect whether a mutation happened, since the route always returns
the current board.

**Testing layers (frontend):** three tiers, not two — unit/component
(Vitest+Testing Library, mocked API), mocked e2e (`npm run test:e2e`,
Playwright against `next dev` with `/api/*` mocked via `page.route()`, fast,
default loop), and full-stack e2e (`npm run test:e2e:full`, real Docker
container + real SQLite + live OpenRouter call, slow, run explicitly and via
`scripts/test-e2e-full.sh`). Keep new e2e tests in the right tier rather than
adding real-network assertions to the mocked suite or vice versa.

## Coding standards (from root AGENTS.md)

- Latest library versions, idiomatic current approaches.
- Keep it simple — no over-engineering, no unnecessary defensive programming,
  no speculative features.
- Concise docs, no emojis ever.
- When hitting issues, find root cause before fixing — don't guess.
- Color palette (must be used via the CSS variables in
  `frontend/src/app/globals.css`, not new hardcoded hex values): accent
  yellow `#ecad0a`, blue primary `#209dd7`, purple secondary `#753991`, dark
  navy `#032147`, gray text `#888888`.

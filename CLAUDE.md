# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A project management app: user accounts, multiple Kanban boards per user,
cards with priority, due dates, labels and checklists (Next.js frontend served as a static export
by a FastAPI backend), SQLite persistence, and an AI chat sidebar (via
OpenRouter) that can read and modify the current board. Full business
requirements, technical decisions, and coding standards are in root
`AGENTS.md` — read it first. The MVP was built in 10 tracked parts and then
expanded to multiple users and boards in Part 11 and labels, checklists and
filters in Part 12; the full history, rationale,
and every design decision made along the way is in `docs/PLAN.md` — check it
before assuming *why* something was built a certain way.

Per-directory `AGENTS.md` files (`backend/AGENTS.md`, `frontend/AGENTS.md`,
`scripts/AGENTS.md`) are the authoritative, up-to-date description of each
area's code and must be kept current when that area changes.

## Commands

Backend (from `backend/`):
- `uv sync` — install deps
- `uv run uvicorn app.main:app --reload` — run locally
- `uv run pytest` — run all tests. The two live OpenRouter tests
  (`test_ai.py`, `test_chat.py::test_chat_live_add_card_to_backlog`) skip
  when `OPENROUTER_API_KEY` is unset
- `uv run pytest --cov` — with coverage
- `uv run pytest tests/test_cards.py::test_name` — run a single test

Frontend (from `frontend/`):
- `npm run dev` — Next.js dev server
- `npm run build` — static export to `frontend/out/`
- `npm run test` / `test:unit` — Vitest unit/component tests
  (`npx vitest run --coverage` for coverage)
- `npm run test:e2e` — Playwright against `next dev`, all `/api/*` mocked (fast)
- `npm run test:e2e:full` — Playwright against a real built Docker container
  (no mocks, live AI call); equivalent to `scripts/test-e2e-full.sh` from the
  repo root
- `npm run test:all` — lint + unit + mocked e2e (not the full-stack suite)
- `npm run lint`

Docker (from repo root):
- `scripts/start.sh` / `start.bat` — build image, run container on port 8000,
  `.env` passed via `--env-file` when it exists (see `.env.example`)
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

**Auth:** Real accounts in the `users` table (scrypt hashes, see
`backend/app/security.py`). Register/login/logout/change password/delete
account live in `backend/app/auth.py`; a seeded demo account is `user` /
`password`. The session is a signed cookie (Starlette `SessionMiddleware`)
holding `user_id`; the secret comes from `SESSION_SECRET` or is regenerated
per process (signing everyone out on restart). Every board, column, card and
chat route depends on `get_current_user`. On the frontend,
`src/app/page.tsx` is a three-state gate (`loading` renders nothing, even in
the static prerender, so board content never flashes; then `anonymous` →
`AuthForm`, `authenticated` → `Workspace`), and any 401 from `lib/api.ts`
drops back to `anonymous`.

**Ownership:** only `boards.user_id` records ownership. The scoped lookups
(`get_board_row`, `get_column_row`, `get_card_row` in `backend/app/board.py`,
`get_label_row` in `labels.py`, `get_item_row` in `checklists.py`) join every
column, card, label and checklist item to its board's owner, so another user's ids 404
exactly like missing ones. Every route and every AI operation goes through
them; `tests/test_isolation.py` exercises each endpoint as a second user.
Keep new routes on these helpers.

**Data model:** SQLite (`backend/app/db.py`), schema in `docs/schema.json` /
`docs/database.md`, version in `PRAGMA user_version`. Cascading foreign keys
(deleting a user, board or column removes everything below it). New boards
get five default columns; a newly registered user gets a starter board. IDs
are DB integers internally, exposed as opaque strings (`"board-1"`,
`"col-3"`, `"card-12"`, `"label-2"`, `"item-5"`). Cards carry `priority`,
`due_date`, `label_ids` and `checklist`; labels belong to a board and a card
may only use its own board's labels.

**Frontend state:** No context/state library. `Workspace.tsx` owns the board
list and active board (remembered per user in `localStorage`);
`KanbanBoard.tsx` owns one board's `BoardData` and every mutation and
dialog, and is keyed by board id. `board.cards` is a `Record<id, Card>`;
`board.columns` holds ordered `cardIds`. Pure logic (`moveCard`,
`dueStatus`, `cardMatches`, `cardPassesFilter`, `checklistProgress`) lives in
`src/lib/kanban.ts` so it's unit-testable without rendering. Search and
filters disable drag and drop, since indices in a filtered list would be
wrong.

**Persistence strategy is deliberately non-uniform** (see `frontend/AGENTS.md`
Persistence section): typing a column title, dragging a card, moving a
column or ticking a checklist item updates local state immediately with the API call in the background
(needs instant feedback, resyncs on failure); discrete actions (add/edit/
delete card, add/delete column, board changes) `await` the API first. Don't
"fix" this into one uniform pattern — it's intentional.

**AI chat (`app/ai.py`, `app/chat.py`):** OpenRouter via the `openai` SDK
(OpenAI-API-compatible `base_url`), model `openai/gpt-oss-120b`.
`POST /api/boards/{id}/chat` takes `{message, history}` — history is
client-owned and resent each turn (the backend keeps only the last 40
messages). The LLM call uses Structured Outputs against `ChatReply`
(`reply` + `operations`), and the prompt includes today's date for relative
due dates. Operations are validated through the same request models as the
HTTP routes and applied through the same scoped helpers, restricted to the
chat's board. Each runs in its own SQLite savepoint, so an invalid or
partly-applied operation is rolled back and skipped rather than failing the
request. The
client wraps its HTTP transport in `DeadlineTransport`: OpenRouter sends
keep-alive whitespace during slow generations that resets httpx's per-read
timeout, so without a whole-request deadline a call can hang for many
minutes. Model timeouts return 504. The frontend always applies the board
the response returns.

**Testing layers (frontend):** three tiers, not two — unit/component
(Vitest+Testing Library, `@/lib/api` and `@/lib/auth` mocked), mocked e2e
(`npm run test:e2e`, Playwright against `next dev` with a stateful in-memory
fake backend in `tests/support/mockApi.ts`, fast, default loop), and
full-stack e2e (`npm run test:e2e:full`, real Docker container + real SQLite
+ live OpenRouter call, slow, run explicitly and via
`scripts/test-e2e-full.sh`). Keep new e2e tests in the right tier rather than
adding real-network assertions to the mocked suite or vice versa. When the
backend API changes, update `mockApi.ts` too, or the mocked tier drifts from
reality.

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

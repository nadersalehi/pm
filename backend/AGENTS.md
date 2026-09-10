# Backend

FastAPI app managed with `uv`. Entry point: `app/main.py`, exposing the
FastAPI `app` instance run via `uvicorn app.main:app`.

## Structure

- `pyproject.toml` — uv-managed project config and dependencies. Not
  packaged as a library (`tool.uv.package = false`).
- `app/main.py` — FastAPI app. Registers `SessionMiddleware` (signed session
  cookie, via `itsdangerous`) using a secret key generated fresh at process
  startup — sessions don't survive a container restart, which is fine for
  this single hardcoded-user MVP. Calls `init_db()` at import time (same
  eager-init pattern as `STATIC_DIR.mkdir()`). API routes (`/api/hello`,
  `/api/login`, `/api/logout`, `/api/me`, and the `board_router`) are
  registered before `app/static/` is mounted at `/` with
  `StaticFiles(html=True)`. Route/mount order matters: routes defined before
  the mount take priority over it.
- `app/auth.py` — hardcoded credentials (`user`/`password`), constant-time
  `verify_credentials`, and the `get_current_username` FastAPI dependency
  (raises 401 if `request.session` has no `username`). `app/board.py`'s
  router uses this dependency (via `dependencies=[Depends(...)]` on the
  `APIRouter`) to protect every board route.
- `app/db.py` — SQLite access. `DB_PATH` defaults to `app/data/kanban.db`
  (overridable via the `DATABASE_PATH` env var — used by tests, see below).
  `init_db()` runs the `CREATE TABLE IF NOT EXISTS` schema (see
  `docs/schema.json` / `docs/database.md`) and, only if `users` is empty,
  seeds the hardcoded user + one board + the 5 fixed columns + the same demo
  cards as `frontend/src/lib/kanban.ts`'s `initialData`. `get_db()` is a
  FastAPI dependency yielding a `sqlite3.Connection` (row_factory =
  `sqlite3.Row`) that commits on success / rolls back on exception. Not
  committed to git (`backend/app/data/`); ephemeral unless the container's
  filesystem itself persists across restarts — no volume mount is set up in
  `scripts/start.sh`.
- `app/board.py` — the board CRUD API (`GET /api/board`,
  `PATCH /api/columns/{id}`, `POST /api/columns/{id}/cards`,
  `PATCH /api/cards/{id}`, `DELETE /api/cards/{id}`,
  `POST /api/cards/{id}/move`). IDs are DB integers internally but exposed to
  the frontend as opaque strings (`"col-3"`, `"card-12"`) via
  `column_ref`/`card_ref`/`parse_ref` — matches the `id: string` contract
  `frontend/src/lib/kanban.ts` already expects (see `docs/database.md`).
  `move_card` renumbers the `position` column of whichever column(s) are
  affected — mirrors what `moveCard` in `frontend/src/lib/kanban.ts` computes
  locally for the same drag-and-drop move (that local computation still
  drives the instant on-screen reorder; `frontend/src/lib/api.ts` persists it
  here in the background). See `frontend/AGENTS.md`'s Persistence section.
- `app/static/` — static files served at `/`. Not committed to git — it holds
  the built Next.js static export (`frontend/out/`) and is populated by the
  Docker build (or manually for local dev; see below). `main.py` creates this
  directory on import if it doesn't exist yet, so the app still starts
  (serving an empty directory) before the frontend has ever been built.
- `app/ai.py` — OpenRouter connectivity. Loads `.env` from the project root
  (`load_dotenv`, so `uv run` works outside Docker too — Docker itself
  already gets `OPENROUTER_API_KEY` via `scripts/start.sh`'s `--env-file`)
  and builds a module-level `openai.OpenAI` client pointed at
  `https://openrouter.ai/api/v1` (OpenRouter is OpenAI-API-compatible), with
  a 30s request `timeout` so a stalled provider response can't hang a
  request forever. `MODEL = "openai/gpt-oss-120b"`. `ask_ai(prompt: str) ->
  str` is the plain-text entry point from Part 8. `Operation` (one board
  mutation: `op` + the relevant optional fields) and `ChatReply` (`reply` +
  `operations: list[Operation]`) are the Pydantic models used as the
  Structured Outputs schema. `chat_completion(board: dict, history:
  list[dict], message: str) -> ChatReply` builds the message list (a system
  prompt describing the operations + the current board as JSON, then
  history, then the new message) and calls `client.chat.completions.parse`
  with `response_format=ChatReply` — confirmed live that `openai/gpt-oss-120b`
  via OpenRouter honors this. Falls back to an empty-operations reply if the
  SDK returns no parsed result (e.g. a refusal) instead of raising.
- `app/chat.py` — the chat route: `POST /api/chat` (same auth dependency
  pattern as `board_router`), accepting `{message, history}` where `history`
  is `[{role, content}]` supplied by the caller each turn (see history
  design decision below) and returning `{reply, board}` (the same `BoardOut`
  shape as `GET /api/board`). Fetches the current board via `board.py`'s
  `get_board`, calls `ai.chat_completion`, then applies each returned
  `Operation` by calling the corresponding `board.py` route function
  directly (`rename_column`/`add_card`/`update_card`/`move_card`/
  `delete_card`) with a constructed request model and the same DB
  connection — no HTTP-internal round trip, and it's the exact code path
  Part 6 already tests. `_apply_operation` requires each operation's
  necessary fields to be present and catches `HTTPException` (e.g. an
  invalid/hallucinated id) so one bad operation is silently skipped rather
  than failing the whole chat request — see Part 9's success criteria
  (malformed structured output must not 500).
- `tests/test_ai.py` — a single live test (no mocking) that calls `ask_ai`
  with a fixed "2+2" prompt and asserts `"4"` is in the response, proving
  the API key, model name, and request/response handling all work end to
  end against the real OpenRouter API. Requires network access and a valid
  `OPENROUTER_API_KEY`.
- `tests/test_main.py` — pytest + FastAPI `TestClient` tests for the routes.
  `test_root_serves_static_site` skips itself if `app/static/index.html`
  doesn't exist yet, since that test needs a real frontend build.
- `tests/test_auth.py` — login/logout/session tests. Each test gets its own
  `TestClient` (via a fixture) so cookies from one test don't leak into the
  next.
- `tests/test_board.py` — board CRUD route tests. An `autouse` `reset_db`
  fixture deletes and re-seeds the DB before every test for isolation; a
  `client` fixture returns an already-logged-in `TestClient`.
- `tests/test_chat.py` — chat route tests (same `reset_db`/`client` fixture
  pattern as `test_board.py`). Most tests monkeypatch `app.chat.chat_completion`
  to return a fixed `ChatReply` so they run offline and deterministically:
  a reply-only response leaves the board unchanged; a response with an
  `add_card` operation mutates it through the real DB; an operation
  referencing a nonexistent column is silently dropped (200, board
  unchanged) rather than 500ing. `test_chat_live_add_card_to_backlog` is the
  one live, unmocked test — a realistic prompt against real OpenRouter,
  asserting the card actually lands in the DB via the full structured-output
  path. Requires network access and a valid `OPENROUTER_API_KEY`.
- `conftest.py` — points `DATABASE_PATH` at a fresh temp-directory file
  (`tempfile.mkdtemp()`) before any test module is imported, so pytest runs
  never touch the real `app/data/kanban.db`. Its mere presence also puts
  `backend/` on `sys.path` so tests can `from app.main import app` regardless
  of how pytest is invoked.

## Frontend build

`frontend/next.config.ts` sets `output: "export"`, so `npm run build` in
`frontend/` produces a static site in `frontend/out/` (no Node server
required to serve it). The root `Dockerfile` builds this in a `node:22-slim`
stage and copies `frontend/out/` to `app/static/` in the final Python image
— see the `frontend-build` stage there for the exact steps.

For local (non-Docker) development against the real frontend:

```
cd frontend && npm run build
rm -rf ../backend/app/static/* && cp -r out/. ../backend/app/static/
```

## Running

- Locally: `uv sync`, then `uv run uvicorn app.main:app --reload`.
- Tests: `uv run pytest`.
- In Docker: see the root `Dockerfile` and `scripts/start.sh` / `start.bat`.
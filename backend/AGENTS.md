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
  affected — same operation `moveCard` in `kanban.ts` does today on in-memory
  arrays; Part 7 will point the frontend at this API instead of that local
  logic.
- `app/static/` — static files served at `/`. Not committed to git — it holds
  the built Next.js static export (`frontend/out/`) and is populated by the
  Docker build (or manually for local dev; see below). `main.py` creates this
  directory on import if it doesn't exist yet, so the app still starts
  (serving an empty directory) before the frontend has ever been built.
- `tests/test_main.py` — pytest + FastAPI `TestClient` tests for the routes.
  `test_root_serves_static_site` skips itself if `app/static/index.html`
  doesn't exist yet, since that test needs a real frontend build.
- `tests/test_auth.py` — login/logout/session tests. Each test gets its own
  `TestClient` (via a fixture) so cookies from one test don't leak into the
  next.
- `tests/test_board.py` — board CRUD route tests. An `autouse` `reset_db`
  fixture deletes and re-seeds the DB before every test for isolation; a
  `client` fixture returns an already-logged-in `TestClient`.
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
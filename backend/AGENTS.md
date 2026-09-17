# Backend

FastAPI app managed with `uv`. Entry point: `app/main.py` (`uvicorn
app.main:app`).

## Structure

- `pyproject.toml` — dependencies (not packaged: `tool.uv.package = false`),
  pytest `testpaths`, coverage settings.
- `app/main.py` — creates the app, adds `SessionMiddleware` (signed cookie,
  `same_site="lax"`), calls `init_db()` at import time, registers
  `GET /api/health` and the auth, board, chat, label and checklist routers,
  then mounts
  `app/static/` at `/`. Routes registered before the mount take priority over
  it, so the mount must stay last.
- `app/security.py` — `hash_password` / `verify_password`: standard-library
  scrypt with a random salt, stored as `scrypt$n$r$p$salt$hash`, compared in
  constant time. No third-party dependency.
- `app/db.py` — SQLite. `DB_PATH` defaults to `app/data/kanban.db`
  (`DATABASE_PATH` env var overrides; tests use it). `SCHEMA` (see
  `docs/database.md`) uses `ON DELETE CASCADE` foreign keys and indexes;
  `PRAGMA foreign_keys = ON` is set per connection, so deletes cascade.
  `init_db()` creates any missing tables (which is also how a version 1
  database gains the version 2 label and checklist tables), records
  `SCHEMA_VERSION` in `PRAGMA user_version`, and seeds the demo account
  (`user` / `password`) with a "Product Roadmap" board, three labels and a
  small checklist when there are no users. `create_user` hashes the
  password and gives the user a starter "My First Board"; `create_board`
  inserts a board with the five default columns. `get_db()` is the
  per-request connection dependency (commit on success, roll back on error).
  The database is not persisted across container rebuilds (no volume).
- `app/auth.py` — `SESSION_SECRET_KEY` (from `SESSION_SECRET`, else random
  per process, which logs everyone out on restart). `get_current_user`
  resolves `session["user_id"]` against the `users` table and returns a
  `CurrentUser(id, username)`; a missing or deleted user clears the session
  and returns 401. Routes: `POST /api/register` (username 3-32 of
  `[A-Za-z0-9_.-]`, password 8-128 chars; 409 if taken, case-insensitive;
  signs in), `POST /api/login` (checks a dummy hash for unknown users so
  timing doesn't reveal which usernames exist), `POST /api/logout` (204),
  `GET /api/me`, `POST /api/me/password` (403 on wrong current password),
  `POST /api/me/delete` (password required; cascades to all the user's
  data).
- `app/board.py` — boards, columns and cards. Ids are integers in the
  database and opaque strings in the API (`board-1`, `col-3`, `card-12`,
  via `board_ref`/`column_ref`/`card_ref`/`parse_ref`). Every lookup
  (`get_board_row`, `get_column_row`, `get_card_row`) joins back to the
  owning user, so another user's ids return 404 exactly like nonexistent
  ones. Routes:
  - `GET/POST /api/boards` (list with `card_count`; create with default
    columns), `GET/PATCH/DELETE /api/boards/{id}`
  - `POST /api/boards/{id}/columns`, `PATCH/DELETE /api/columns/{id}`,
    `POST /api/columns/{id}/move` (`index`)
  - `POST /api/columns/{id}/cards`, `PATCH/DELETE /api/cards/{id}`,
    `POST /api/cards/{id}/move` (`column_id`, optional `index`; 400 if the
    target column is on a different board)
  Cards have `title`, `details`, `priority` (`none`/`low`/`medium`/`high`),
  `due_date` (ISO date or null), `label_ids` and a `checklist`; the board
  response also lists the board's `labels`. Card labels and checklists are
  loaded in batches (`_cards_out`), so a board costs a fixed number of queries
  regardless of size. Card PATCH applies only the fields sent; `due_date: null`
  clears the date, `label_ids` replaces the card's labels, and null for other
  fields is ignored. `set_card_labels` rejects (400) labels from another
  board.
  Positions are renumbered contiguously on moves and column deletes. The
  mutation helpers (`add_card`, `update_card`, `move_card`, `delete_card`,
  `rename_column`, `build_board`) take rows already resolved by the scoped
  lookups and are shared with `chat.py`.
- `app/labels.py` — `POST /api/boards/{id}/labels`, `PATCH/DELETE
  /api/labels/{id}`. Names are 1-40 chars and unique per board
  (case-insensitive, 409 on conflict); colors are the palette names `yellow`,
  `blue`, `purple`, `navy`, `gray`. `get_label_row` is scoped to the owner.
- `app/checklists.py` — `POST /api/cards/{id}/checklist`, `PATCH/DELETE
  /api/checklist/{id}` (`text`, `done`). Items keep insertion order.
  `get_item_row` is scoped to the owner through card, column and board.
- `app/ai.py` — OpenRouter via the `openai` SDK, model
  `openai/gpt-oss-120b`, client created lazily (the app runs without
  `OPENROUTER_API_KEY`; only chat needs it). `DeadlineTransport` caps a whole
  request at `REQUEST_DEADLINE_SECONDS`: OpenRouter sends whitespace
  keep-alive bytes during slow generations, which keep resetting httpx's
  per-read timeout, so without it one call was observed running for 19
  minutes. `ask_ai` is a plain prompt helper; `chat_completion(board,
  history, message)` sends a system prompt (operations, today's date for
  relative due dates, the board JSON) and parses a `ChatReply` (`reply` +
  `operations`) with Structured Outputs. If the model returns nothing
  parseable (it occasionally emits raw chat-format tokens instead of JSON,
  which raises a pydantic `ValidationError`), it logs a warning and returns a
  polite `UNPROCESSABLE_REPLY` instead of failing the request.
- `app/chat.py` — `POST /api/boards/{id}/chat` with `{message, history}`
  (message up to 4000 chars, history up to 200 entries, only the last 40 are
  sent to the model). Operations (`rename_column`, `add_card`, `edit_card`,
  `move_card`, `delete_card`, `add_checklist_item`, `complete_checklist_item`;
  card operations accept `label_ids`) are validated through the same request
  models as the HTTP routes and resolved through `_BoardScope`, which rejects
  ids from other boards or users. Each operation runs inside its own SQLite
  savepoint, so one that fails partway (for example a card insert followed by
  a rejected label) is rolled back completely and skipped without failing the
  request. Skipped operations are logged with their reason, and the reply
  gets a note such as "(1 requested change couldn't be applied.)" so the user
  isn't told a change happened when it didn't. Model timeouts return 504 and other provider errors
  502. The reply always includes the current board.
- `app/static/` — the built frontend (not committed). Created on import if
  missing so the app starts before a frontend build exists.

## Tests

`uv run pytest` (add `--cov` for coverage). Shared fixtures are in
`tests/conftest.py`: an autouse `reset_db` (fresh seeded database per test),
`anon` (signed-out client), `client` (signed in as the demo user),
`make_user` (registers and signs in another user), `db` (raw connection).
`tests/helpers.py` has `first_board` and `requires_openrouter` (skips live
tests when no key is configured). The root `conftest.py` points
`DATABASE_PATH` at a temp directory before the app is imported.

- `test_auth.py` — login, logout, registration and validation, password
  change, account deletion (including cascade and stale sessions).
- `test_boards.py`, `test_columns.py`, `test_cards.py`, `test_labels.py`,
  `test_checklists.py` — CRUD, validation, ordering, cascades, cross-board
  label rejection with no partial writes.
- `test_isolation.py` — every board/column/card/label/checklist/chat
  endpoint called with another user's ids is refused (404, or 400 for
  attaching another user's label to your own card) and leaves the data
  unchanged.
- `test_chat.py` — chat with a fake model: operations applied, invalid
  operations dropped, cross-board and cross-user operations refused, history
  trimming, request validation, 504/502 mapping, label and checklist
  operations, full rollback of a partially applied operation; plus one live
  test.
- `test_ai.py` — one live OpenRouter test. `test_ai_transport.py` — the
  deadline transport against a trickling fake response.
  `test_ai_chat_completion.py` — prompt construction and the fallbacks for
  unparsed and malformed model output, with a fake client.
- `test_db.py`, `test_security.py`, `test_main.py` — schema version,
  idempotent init, upgrade of a version 1 database without data loss,
  hashing, health endpoint and static serving.

## Frontend build

`frontend/next.config.ts` sets `output: "export"`; the root `Dockerfile`
builds it in a Node stage and copies `frontend/out/` to `app/static/`. For
local development without Docker:

```
cd frontend && npm run build
rm -rf ../backend/app/static/* && cp -r out/. ../backend/app/static/
```

## Running

- Locally: `uv sync`, then `uv run uvicorn app.main:app --reload`.
- In Docker: see `scripts/start.sh` / `start.bat`.

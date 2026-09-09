# High level steps for project

See root `AGENTS.md` for business requirements, technical decisions, and coding
standards. Each part below must be completed and its success criteria verified
before moving to the next part. Check off substeps as they are completed.

---

## Part 1: Plan

- [x] Enrich this document with a detailed checklist, tests, and success
      criteria for every part.
- [x] Create `frontend/AGENTS.md` describing the existing frontend code.
- [x] User reviews and approves this plan before Part 2 begins.

**Success criteria:** User has explicitly approved this document.

---

## Part 2: Scaffolding

Set up Docker infrastructure, a minimal FastAPI backend, and start/stop
scripts, proving the container serves static HTML and can make an API call —
before any real frontend or business logic exists.

- [x] Create `backend/pyproject.toml` for a `uv`-managed FastAPI project
      (FastAPI, `uvicorn`).
- [x] Create `backend/app/main.py` with:
  - [x] `GET /` serving a static "hello world" HTML page (from a
        `backend/app/static/` directory, not templated) — this stands in for
        the future built frontend.
  - [x] `GET /api/hello` returning JSON, e.g. `{"message": "Hello from the
        API"}`.
- [x] Write a `Dockerfile` at the project root:
  - [x] Installs `uv`, installs backend dependencies with it.
  - [x] Copies backend code in.
  - [x] Exposes the app port and runs it with `uvicorn`.
- [x] Write `scripts/start.sh` (Mac/Linux), `scripts/start.bat` (PC), and
      Windows/Mac/Linux equivalents for stop (`scripts/stop.sh`,
      `scripts/stop.bat`) that build/run/stop the Docker container. Update
      `backend/AGENTS.md` and `scripts/AGENTS.md` placeholder text with real
      descriptions once these exist.
- [x] `.dockerignore` covering `node_modules`, `.venv`, test artifacts, etc.

**Tests:**
- [x] Manual: run the start script, confirm `GET /` returns the hello-world
      HTML and `GET /api/hello` returns the expected JSON, run the stop
      script and confirm the container is gone.
- [x] Add a basic backend test (`pytest` + `httpx`/`TestClient`) asserting
      both routes return 200 with expected content, runnable outside Docker.

**Success criteria:** `scripts/start` builds and runs the container; hitting
`/` and `/api/hello` locally both work as described; `scripts/stop` cleanly
tears the container down; `pytest` passes.

---

## Part 3: Add in Frontend

Statically build the real Next.js frontend (from Part 1's starting point) and
serve it from FastAPI at `/`, replacing the Part 2 placeholder HTML.

- [x] Configure Next.js for static export (`output: "export"` in
      `next.config.ts`) since FastAPI serves static files, not a Node
      server.
- [x] Add a build step (documented in `backend/AGENTS.md` or a script) that
      runs `npm run build` in `frontend/` and copies the exported output into
      `backend/app/static/`.
- [x] Update FastAPI to serve the exported frontend (static files + SPA
      fallback as needed) at `/`, removing the Part 2 placeholder HTML.
- [x] Update the Dockerfile to a multi-stage build: build the frontend with
      Node, then copy only the static output into the Python/uv runtime
      stage (final image should not need Node at runtime).
- [x] Confirm existing frontend unit tests (Vitest) and e2e tests
      (Playwright) still pass unchanged.

**Tests:**
- [x] Frontend: existing `npm run test:all` continues to pass.
- [x] Backend/integration: a test (or documented manual step) that builds the
      container and confirms `GET /` returns the real Kanban board HTML
      (not the Part 2 placeholder), and static assets (JS/CSS) load with
      200s.

**Success criteria:** Running the container and visiting `/` shows the full
demo Kanban board (drag/drop, rename, add/delete cards all work exactly as
in the standalone frontend), served entirely by FastAPI from static files.

---

## Part 4: Add in a fake user sign in experience

Gate the Kanban board behind a hardcoded login (`user` / `password`), with
logout, per root AGENTS.md limitations (single hardcoded user for the MVP).

- [x] Backend: add a login endpoint that checks the hardcoded credentials and
      sets a session (signed cookie or simple session token) on success;
      add a logout endpoint that clears it; add an auth-check dependency
      used to protect data routes added in later parts.
- [x] Frontend: add a login page/screen shown when not authenticated,
      redirect to the Kanban board on success, and a logout control once
      inside the board.
- [x] Frontend: on load, check auth state before rendering the board;
      unauthenticated users never see board content, even briefly.

**Tests:**
- [x] Backend: unit tests for login success, login failure (wrong
      credentials), logout, and that a protected route rejects unauthenticated
      requests and accepts authenticated ones.
- [x] Frontend: component/e2e test that an unauthenticated visit to `/` shows
      the login form, wrong credentials show an error and do not log in,
      correct credentials show the board, and logout returns to the login
      form.

**Success criteria:** Visiting `/` without a session always shows login;
`user`/`password` logs in and shows the board; logout works and re-gates the
board; wrong credentials are rejected with a visible error.

---

## Part 5: Database modeling

Design the persistent data model for the Kanban board (and users), get user
sign-off before writing backend code that depends on it.

- [x] Propose a schema covering: users, the single board per user, columns
      (id, title, order), cards (id, column id, order, title, details).
  - [x] Save the schema as JSON in `docs/` (e.g. `docs/schema.json`),
        illustrating tables/fields and an example row set.
- [x] Write `docs/database.md` documenting: the schema, why SQLite, how the
      "one board per user" MVP constraint maps into the schema (vs. future
      multi-board), and how ordering of columns/cards is stored.
- [x] Confirm the schema can represent every action the existing frontend
      demo supports (rename column, add/delete/move card, reorder within and
      across columns) without data loss.

**Tests:** N/A (design artifact) — but sanity-check the schema against the
`BoardData` shape in `frontend/src/lib/kanban.ts` field by field. Done — see
the coverage table in `docs/database.md`.

**Success criteria:** User has explicitly reviewed and approved
`docs/database.md` and `docs/schema.json` before Part 6 begins.

---

## Part 6: Backend

Implement the database and CRUD API routes for the Kanban board per the
approved schema.

- [x] Add SQLite setup: create the DB file and tables on first run if they
      don't exist (migration-free for MVP), seeded with one default board for
      the hardcoded user.
- [x] Implement API routes (all behind the Part 4 auth dependency) to: get the
      current user's board (columns + cards), rename a column, add a card,
      edit a card, delete a card, move a card (column and/or position).
- [x] Define request/response schemas (Pydantic models) matching the
      approved JSON schema.

**Tests:**
- [x] Backend unit tests (pytest) for every route: happy path, and relevant
      edge cases (e.g. moving a card to a nonexistent column, renaming a
      nonexistent column, deleting a card twice).
- [x] Test that a fresh run with no existing DB file creates it and seeds a
      default board.
- [x] Test that unauthenticated requests to these routes are rejected
      (reusing Part 4's auth tests as a base).

**Success criteria:** All backend tests pass; deleting the SQLite file and
restarting the server recreates it with a working default board; every
frontend-demo interaction has a corresponding, tested API route.

---

## Part 7: Frontend + Backend

Replace the frontend's in-memory `initialData`/local state with real API
calls, making the Kanban board persistent across reloads.

- [x] Replace `src/lib/kanban.ts`'s in-memory seed with data fetched from the
      backend on load; keep `moveCard` and other pure helpers, adapting them
      to work with API responses.
- [x] Wire rename/add/delete/move handlers in `KanbanBoard.tsx` to call the
      corresponding backend routes (optimistic update or refetch after each
      change — pick one approach and apply it consistently).
- [x] Handle loading and error states (e.g. API unreachable) in the UI.
- [x] Update/replace frontend unit tests to mock the API instead of relying
      on in-memory seed data; update Playwright e2e tests to run against the
      full stack (real backend + SQLite) rather than the standalone demo.

**Tests:**
- [x] Frontend unit tests with the API layer mocked, covering the same
      interactions as before (render, rename, add/delete card) plus
      loading/error states.
- [x] Playwright e2e test running against the real container/stack: log in,
      rename a column, add a card, delete a card, reload the page, and
      confirm all changes persisted.

**Success criteria:** Reloading the browser (or restarting the container)
preserves all board changes; every interaction goes through the backend and
SQLite, with no client-only state left for board data.

---

## Part 8: AI connectivity

Prove the backend can call an LLM through OpenRouter before building any
Kanban-specific AI behavior.

- [ ] Add an OpenRouter client in the backend using `OPENROUTER_API_KEY` from
      `.env` and model `openai/gpt-oss-120b`.
- [ ] Add a minimal internal test route/script that sends a fixed prompt
      (e.g. "What is 2+2? Answer with only the number.") and returns/logs the
      model's response.

**Tests:**
- [ ] Backend test that calls the "2+2" route/function and asserts the
      response contains "4" (live call against OpenRouter — mark clearly as
      requiring network/API access, not mocked, since this step is explicitly
      about proving connectivity).

**Success criteria:** The 2+2 test passes against the real OpenRouter API,
confirming the API key, model name, and request/response handling all work
end to end.

---

## Part 9: AI + Kanban structured outputs

Extend the AI call so it always has full board context and can propose
structured Kanban updates alongside a chat reply.

- [ ] Design the request: system/context includes the current board as JSON
      (per Part 5/6 schema), the user's message, and prior conversation
      history (define how history is stored/passed — e.g. client sends it
      each turn, or backend persists a conversation per user).
- [ ] Define a Structured Outputs schema for the response: a user-facing
      reply string, plus an optional board update (e.g. list of operations:
      rename column, add/edit/move/delete card) using the same shapes as the
      Part 6 API.
- [ ] Implement a backend route that: accepts a chat message, calls the LLM
      with board + history + message, parses the structured response,
      applies any board update via the existing Part 6 persistence logic, and
      returns the reply text plus the (possibly updated) board.
- [ ] Decide and document how conversation history is scoped (per session,
      per user) given the single hardcoded user for MVP.

**Tests:**
- [ ] Backend tests with a mocked LLM response verifying: a reply-only
      response changes nothing on the board; a response including a board
      update actually mutates the DB via the same code path as Part 6's
      routes; malformed/unexpected structured output is handled without
      crashing the route.
- [ ] At least one live test against OpenRouter with a realistic prompt
      (e.g. "add a card called X to the Backlog column") asserting the board
      is updated as expected.

**Success criteria:** A chat message that asks for a board change results in
a persisted board change verifiable via the Part 6 GET-board route; a chat
message that's just a question changes nothing; structured output parsing
failures are handled gracefully (no 500s).

---

## Part 10: AI chat sidebar UI

Add the user-facing chat sidebar, wired to Part 9's endpoint, with automatic
board refresh on AI-driven updates.

- [ ] Build a sidebar component (message list, input box, send button) styled
      per the root AGENTS.md color scheme.
- [ ] Wire it to the Part 9 chat endpoint: send message + relevant history,
      display the assistant's reply, and if the response included a board
      update, refresh the board view from the returned/updated board data
      (no manual page reload needed).
- [ ] Handle loading state while waiting on the AI and error state if the
      call fails.

**Tests:**
- [ ] Frontend unit tests with the chat API mocked: sending a message
      displays the reply; a response with a board update triggers the board
      UI to reflect it without a reload; error responses show an error state.
- [ ] Playwright e2e test against the real stack: ask the AI to modify the
      board (e.g. "add a card to Backlog called Test AI Card") and assert the
      card appears in the UI without a manual refresh.

**Success criteria:** From a logged-in session, a user can chat in the
sidebar, get replies, and see the Kanban board update live when the AI
decides to change it — completing the full MVP described in the root
AGENTS.md.

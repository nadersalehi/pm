# Frontend

## Current State

The Kanban board is fully persisted through the backend API — no client-only
board state left. It's built as a static export (`output: "export"`) and
served by the backend at `/`; see backend `AGENTS.md` for the build/copy
step. It sits behind a real (if hardcoded) login gate — see Auth below.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 (via `@tailwindcss/postcss`, imported in `globals.css`)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop
- `clsx` for conditional classnames
- `lucide-react` for icons (all actions on the board are icon buttons)
- Vitest + Testing Library for unit/component tests
- Playwright for e2e tests

## Structure

- `src/app/layout.tsx` — root layout; loads Google fonts (Space Grotesk for
  display, Manrope for body) as CSS variables, sets page metadata.
- `src/app/page.tsx` — the `/` route; a client component that is the auth
  gate (see Auth below). No other routes exist.
- `src/app/globals.css` — Tailwind import, color tokens as CSS variables
  (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`,
  `--gray-text`, plus surface/stroke/shadow tokens) matching the palette in the
  root AGENTS.md, and the `--font-display` / `--font-body` font wiring.
- `src/lib/kanban.ts` — pure domain types/logic, no data of its own anymore:
  - Types: `Card`, `Column`, `BoardData`.
  - `moveCard(columns, activeId, overId)` — pure function computing the new
    column layout after a drag-and-drop move (same-column reorder,
    cross-column move, drop-on-column-vs-drop-on-card). Still used for the
    instant local reorder on drag-end; `lib/api.ts` persists the result.
- `src/lib/api.ts` — the backend API client. `fetchBoard()` calls
  `GET /api/board` and adapts its nested `{columns: [{..., cards: [...]}]}`
  shape into the frontend's normalized `BoardData` (`toBoardData`).
  `renameColumn`, `addCard`, `deleteCard`, `moveCard` wrap the other board
  routes (see `backend/app/board.py`). Imported as `import * as api from
  "@/lib/api"` at call sites to avoid colliding with `kanban.ts`'s own
  `moveCard`. `sendChatMessage(message, history)` calls `POST /api/chat`
  (see `backend/app/chat.py`) and adapts its `{reply, board}` response the
  same way (`toBoardData` on the nested board). `ChatMessage` (`{role: "user"
  | "assistant", content: string}`) is exported from here since both
  `lib/api.ts` and `ChatSidebar.tsx` need the shape.
- `src/components/KanbanBoard.tsx` — top-level client component. Fetches the
  board from the API on mount (`loading` / error / loaded states — see
  Persistence below), wires up `@dnd-kit` `DndContext`, and passes down
  rename / add-card / delete-card handlers. Layout: a one-row app bar (title,
  column/card counts, `mutationError` banner, icon buttons to show/hide the
  assistant and log out), then the board and `ChatSidebar`. At `lg:` the page
  is fixed to the viewport (`h-dvh`): columns are a single row of grid tracks
  (`auto-cols-[minmax(200px,1fr)]`) sharing the full width, each column
  scrolls its own cards, and the board scrolls horizontally only when the
  minimum column width no longer fits (e.g. 1280px with the assistant open).
  Below `lg:` the page flows normally: columns become a horizontal
  scroll-snap strip (85% width each) with the assistant stacked underneath.
  The assistant is hidden with the `hidden` attribute rather than unmounted,
  so the transcript survives a hide/show (covered by a unit test). A
  `DragOverlay` renders `KanbanCardPreview` at the dragged card's measured
  width. `ChatSidebar`'s
  `onBoardUpdate` prop is wired directly to `setBoard` — every chat response
  carries the current board (whether or not it changed anything), so the
  board view is simply always resynced from it, no diffing needed.
- `src/components/ChatSidebar.tsx` — the AI chat sidebar. Owns the message
  list (`ChatMessage[]`) and input as local state (no board data lives
  here). On send: appends the user's message locally, calls
  `api.sendChatMessage(message, historyBeforeThisTurn)`, appends the
  assistant's reply on success and calls `onBoardUpdate(board)`, or sets an
  error message on failure (shown via `role="alert"`, same pattern as
  `KanbanBoard`'s `mutationError`). Shows a "Thinking..." bubble while a
  request is in flight. History is entirely client-owned — see the Part 9
  design decision in `docs/PLAN.md` for why (the sidebar already needs this
  list in state to render the transcript, so sending it each turn avoids a
  second, backend-side source of truth). Fixed-height panel: the transcript
  scrolls internally and is scrolled to the newest message on every update.
- `src/components/KanbanColumn.tsx` — one column: droppable container,
  header row with the editable column title (`<input>` — `onChange` updates
  local state on every keystroke via `onRename`, `onBlur` persists via
  `onRenameCommit`), a card-count badge and a "+" icon button (accessible name
  "Add a card") that opens `NewCardForm` at the top of the card list; then
  `SortableContext` wrapping its cards and an empty-state placeholder.
- `src/components/KanbanCard.tsx` — one draggable card (`useSortable`),
  displays title/details, and a trash icon button (accessible name
  "Delete <title>") in its top-right corner. On devices with hover it only
  appears on card hover or keyboard focus; on touch devices it is always
  visible.
- `src/components/KanbanCardPreview.tsx` — non-interactive visual clone of a
  card, used only inside `DragOverlay` while dragging.
- `src/components/NewCardForm.tsx` — the inline add-card form only (the
  column owns whether it is open). Title/details inputs plus check ("Add
  card", submit) and X ("Cancel") icon buttons; Escape also cancels.
  `onAdd(title, details)` returns a `Promise<void>` — the form awaits it and
  calls `onClose` only on success (the check button is disabled in between),
  and stays open with the typed input intact if it rejects, so a failed save
  doesn't lose input.
- `src/components/IconButton.tsx` — shared round icon-only button. Takes a
  `label` used as both `aria-label` and the `title` tooltip, so tests and
  assistive tech find icon buttons by name exactly as they did text buttons.
  `variant="primary"` is the filled purple submit style.
- `src/components/LoginForm.tsx` — username/password form; calls
  `lib/auth.login`, shows an error message on failure, calls `onSuccess(user)`
  on success.
- `src/lib/auth.ts` — thin `fetch` wrappers: `fetchSession` (`GET /api/me`,
  returns `null` on any non-2xx instead of throwing), `login` (`POST
  /api/login`, throws on failure), `logout` (`POST /api/logout`).

## Auth

`page.tsx` is a three-state gate (`loading` / `anonymous` / `authenticated`)
that calls `fetchSession()` in a `useEffect` on mount:
- `loading` (initial state, and what gets statically prerendered at build
  time since the effect hasn't run yet) renders nothing — this is what keeps
  board content from ever appearing before auth is confirmed, even in the
  static HTML shell.
- `anonymous` renders `<LoginForm onSuccess={...} />`.
- `authenticated` renders `<KanbanBoard onLogout={...} />`; `KanbanBoard`
  has a "Log out" icon button in its app bar wired to that prop.

There's no client-side session storage of its own — the backend's signed
session cookie is the source of truth; the frontend just asks `/api/me` on
load and reacts to 200 vs 401.

## Persistence

`KanbanBoard` fetches the board from the API in a `useEffect` on mount, with
three render states: `board === null && !loadError` → "Loading board..."
text; `loadError` → an error message with a Retry button that re-fetches;
otherwise the board itself. There's no client-only board state left — every
mutation goes through `lib/api.ts`. The persistence strategy differs by
interaction, deliberately, not inconsistently:
- **Typing a column title / dragging a card** need instant feedback, so
  these apply the change to local state immediately (`onRename` per
  keystroke; `moveCard` from `kanban.ts` on drag-end) and persist in the
  background (`onRenameCommit` on blur; `api.moveCard` fired right after the
  local update). A failed background persist sets `mutationError` (shown as
  an inline banner in the app bar) — a failed move also re-fetches the board to
  resync with the server.
- **Add / delete card** are discrete button clicks where a small delay is
  imperceptible, so these `await` the API call before touching local state
  at all (add needs the server-assigned id anyway; see `NewCardForm` above
  for how a failed add is surfaced without losing the typed input).

## Data flow

`BoardData` lives in `KanbanBoard`, seeded from `lib/api.fetchBoard()`. There
is no context or state library — state and handlers are passed down as props
one level at a time. `board.cards` is a `Record<id, Card>`; `board.columns`
holds ordered `cardIds` arrays, so moving a card is purely a matter of
recomputing which column's `cardIds` array contains which ids and in what
order (`moveCard`). IDs are opaque strings assigned by the backend
(`"col-3"`, `"card-12"`) — nothing on the frontend parses or generates them.

## Testing

- Unit/component tests: `npm run test` / `test:unit` (Vitest, jsdom). Located
  next to the code they test (`*.test.ts` / `*.test.tsx`):
  - `src/lib/kanban.test.ts` — covers `moveCard` (reorder, cross-column move,
    drop-on-column).
  - `src/components/KanbanBoard.test.tsx` — `vi.mock("@/lib/api")`, so no
    network involved. Covers loading state, load-error state (with the API
    layer mocked, not a real backend), logout wiring, rename (local echo +
    persist-on-blur), add/delete a card, a failed add keeping the form's
    input intact, and that an AI chat reply's returned board is reflected in
    the UI with no reload. `LoginForm`/`lib/auth.ts` have no dedicated unit
    tests — they're thin enough that the Playwright login flow (below)
    already covers them without duplicating the same assertions at a second
    layer.
  - `src/components/ChatSidebar.test.tsx` — `vi.mock("@/lib/api")`. Covers:
    sending a message shows both the user's message and the reply; a
    successful reply calls `onBoardUpdate` with the returned board; the
    prior turns are sent back as `history` on the next message; a pending
    call shows the "Thinking..." state; a rejected call shows the error
    state.
- Mocked e2e tests: `npm run test:e2e` (Playwright), driven against a
  `next dev` server on `127.0.0.1:3000` (see `playwright.config.ts`) with no
  real backend — `/api/*` calls are mocked with `page.route()` via
  `tests/support/auth.ts` (session) and `tests/support/board.ts` (board CRUD,
  seeded with the same demo data the backend's `init_db()` seeds a real
  database with). This is the fast day-to-day suite for UI behavior.
  - `tests/kanban.spec.ts` — board interactions; `beforeEach` mocks an
    already-authenticated session + board so these don't re-test login each
    time.
  - `tests/login.spec.ts` — the login gate itself: shows the login form when
    unauthenticated, rejects wrong credentials with a visible error, and a
    full login → logout round trip.
- Full-stack e2e tests: `npm run test:e2e:full` (from `frontend/`) or
  `scripts/test-e2e-full.sh` (from the repo root) — builds the real Docker
  image, runs it (with `--env-file .env` so `OPENROUTER_API_KEY` reaches the
  container — needed for the live AI test below), waits for `/api/hello` to
  respond, runs everything in `tests-full-stack/` with
  `playwright.full-stack.config.ts` (`baseURL` = the container on `:8000`,
  no mocked routes, no `webServer` — the shell script owns the container's
  lifecycle and always tears it down on exit via a `trap`). Both specs share
  that one live backend + SQLite DB, so the config sets `workers: 1` to run
  them serially rather than racing each other's mutations. Deliberately kept
  separate from `test:e2e` since it needs Docker (and, for the AI spec, live
  network) and is much slower — not part of the fast loop.
  - `tests-full-stack/board-persistence.spec.ts` — log in, rename a column,
    add a card, delete a card, reload, and assert all three changes survived
    against the real backend + SQLite.
  - `tests-full-stack/ai-chat.spec.ts` — log in, send a message through the
    real chat sidebar asking to add a card to the first column (reading that
    column's current title from the DOM rather than assuming "Backlog",
    since `board-persistence.spec.ts` may have already renamed it), and
    assert the card shows up with no reload — a live, unmocked call through
    the full Part 9 structured-output path. Uses a longer (30s) assertion
    timeout for that one expectation, since it's waiting on a real LLM call.
- `npm run test:all` runs lint + the unit + mocked-e2e suites (not the
  full-stack one — run that explicitly).
- `src/test/vitest.d.ts` must reference `vitest/globals` (not `vitest`) and
  `@testing-library/jest-dom/vitest` (not `@testing-library/jest-dom`) — the
  bare specifiers resolve to Jest-flavoured types and leave `describe`/`it`/
  `expect`/`vi` and the DOM matchers untyped. That failure shows up only in
  `next build`'s TypeScript pass, which type-checks test files too; `vitest
  run` passes either way.

## Conventions to follow when extending this code

- Keep board-mutation logic as pure functions in `src/lib/kanban.ts` (like
  `moveCard`) rather than inlining it in components, so it stays unit
  testable without rendering.
- Components stay presentational/handler-driven — state changes flow back up
  via callback props (`onRename`, `onAddCard`, `onDeleteCard`), not local
  component state for board data.
- Use the CSS variables in `globals.css` for color, not new hardcoded hex
  values, to stay on the palette defined in the root AGENTS.md.
- `data-testid` attributes (`column-${id}`, `card-${id}`) are used for test
  targeting — keep these stable when refactoring markup.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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
  `moveCard`.
- `src/components/KanbanBoard.tsx` — top-level client component. Fetches the
  board from the API on mount (`loading` / error / loaded states — see
  Persistence below), wires up `@dnd-kit` `DndContext`, and passes down
  rename / add-card / delete-card handlers. Renders the header (with a
  `mutationError` banner) and a `DragOverlay` using `KanbanCardPreview` for
  the dragged card.
- `src/components/KanbanColumn.tsx` — one column: droppable container,
  editable column title (`<input>` — `onChange` updates local state on every
  keystroke via `onRename`, `onBlur` persists via `onRenameCommit`),
  `SortableContext` wrapping its cards, empty-state placeholder, and the
  `NewCardForm` at the bottom.
- `src/components/KanbanCard.tsx` — one draggable card (`useSortable`),
  displays title/details, has a "Remove" button.
- `src/components/KanbanCardPreview.tsx` — non-interactive visual clone of a
  card, used only inside `DragOverlay` while dragging.
- `src/components/NewCardForm.tsx` — inline add-card form; toggles between a
  "Add a card" button and a title/details form; `onAdd(title, details)`
  returns a `Promise<void>` — the form awaits it, only resetting/closing on
  success (an `isSubmitting` disabled state in between), and stays open with
  the typed input intact if it rejects, so a failed save doesn't lose input.
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
  has a "Log out" button in its header wired to that prop.

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
  a banner under the header) — a failed move also re-fetches the board to
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
    persist-on-blur), add/delete a card, and a failed add keeping the form's
    input intact. `LoginForm`/`lib/auth.ts` have no dedicated unit tests —
    they're thin enough that the Playwright login flow (below) already
    covers them without duplicating the same assertions at a second layer.
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
- Full-stack e2e test: `npm run test:e2e:full` (from `frontend/`) or
  `scripts/test-e2e-full.sh` (from the repo root) — builds the real Docker
  image, runs it, waits for `/api/hello` to respond, runs
  `tests-full-stack/board-persistence.spec.ts` with
  `playwright.full-stack.config.ts` (`baseURL` = the container on `:8000`,
  no mocked routes, no `webServer` — the shell script owns the container's
  lifecycle and always tears it down on exit via a `trap`). This is the one
  test that actually proves persistence: log in, rename a column, add a
  card, delete a card, reload, and assert all three changes survived against
  the real backend + SQLite. Deliberately kept separate from `test:e2e`
  since it needs Docker and is much slower — not part of the fast loop.
- `npm run test:all` runs the unit + mocked-e2e suites (not the full-stack
  one — run that explicitly).

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

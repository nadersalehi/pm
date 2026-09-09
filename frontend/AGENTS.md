# Frontend

## Current State

The Kanban board itself still has no persistence — board state lives in React
state and resets on reload (that's Part 6/7's job). It's built as a static
export (`output: "export"`) and served by the backend at `/`; see backend
`AGENTS.md` for the build/copy step. It now sits behind a real (if hardcoded)
login gate — see Auth below.

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
- `src/lib/kanban.ts` — pure domain logic and in-memory seed data:
  - Types: `Card`, `Column`, `BoardData`.
  - `initialData` — hardcoded 5-column, 8-card demo board.
  - `moveCard(columns, activeId, overId)` — pure function computing the new
    column layout after a drag-and-drop move (same-column reorder,
    cross-column move, drop-on-column-vs-drop-on-card).
  - `createId(prefix)` — generates a pseudo-unique id for new cards.
- `src/components/KanbanBoard.tsx` — top-level client component. Owns all
  board state (`useState<BoardData>`), wires up `@dnd-kit` `DndContext`
  (sensors, drag start/end handlers), and passes down rename / add-card /
  delete-card handlers. Renders the header and a `DragOverlay` using
  `KanbanCardPreview` for the dragged card.
- `src/components/KanbanColumn.tsx` — one column: droppable container,
  editable column title (`<input>`, calls `onRename` on every keystroke — no
  separate save action), `SortableContext` wrapping its cards, empty-state
  placeholder, and the `NewCardForm` at the bottom.
- `src/components/KanbanCard.tsx` — one draggable card (`useSortable`),
  displays title/details, has a "Remove" button.
- `src/components/KanbanCardPreview.tsx` — non-interactive visual clone of a
  card, used only inside `DragOverlay` while dragging.
- `src/components/NewCardForm.tsx` — inline add-card form; toggles between a
  "Add a card" button and a title/details form; calls `onAdd(title, details)`
  on submit and resets/closes itself.
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

## Data flow

All state (`BoardData`) lives in `KanbanBoard`. There is no context or state
library — state and handlers are passed down as props one level at a time.
`board.cards` is a `Record<id, Card>`; `board.columns` holds ordered
`cardIds` arrays, so moving a card is purely a matter of recomputing which
column's `cardIds` array contains which ids and in what order (`moveCard`).

## Testing

- Unit/component tests: `npm run test` / `test:unit` (Vitest, jsdom). Located
  next to the code they test (`*.test.ts` / `*.test.tsx`):
  - `src/lib/kanban.test.ts` — covers `moveCard` (reorder, cross-column move,
    drop-on-column).
  - `src/components/KanbanBoard.test.tsx` — renders the board, logout button
    wiring, renames a column, adds and removes a card. `LoginForm` and
    `lib/auth.ts` have no dedicated unit tests — they're thin enough that the
    Playwright login flow (below) already covers them without duplicating the
    same assertions at a second layer.
- E2e tests: `npm run test:e2e` (Playwright), driven against a `next dev`
  server on `127.0.0.1:3000` (see `playwright.config.ts`) with no real
  backend running — `/api/*` calls are mocked with `page.route()` via
  `tests/support/auth.ts`. Full-stack e2e against the real backend + SQLite
  comes later, in Part 7.
  - `tests/kanban.spec.ts` — board interactions; `beforeEach` mocks an
    already-authenticated session so these don't re-test login each time.
  - `tests/login.spec.ts` — the login gate itself: shows the login form when
    unauthenticated, rejects wrong credentials with a visible error, and a
    full login → logout round trip.
- `npm run test:all` runs both suites.

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

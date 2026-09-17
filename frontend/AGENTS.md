# Frontend

## Current State

A multi-user, multi-board Kanban client. Everything is persisted through the
backend API; there is no client-only board state. It is built as a static
export (`output: "export"`) and served by the backend at `/` (see
`backend/AGENTS.md` for the build/copy step).

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 (via `@tailwindcss/postcss`, imported in `globals.css`)
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag and drop
- `lucide-react` for icons (board actions are icon buttons)
- `clsx` for conditional classnames
- Vitest + Testing Library for unit/component tests, Playwright for e2e

## Structure

- `src/app/layout.tsx` — root layout; Google fonts (Space Grotesk display,
  Manrope body) as CSS variables, page metadata.
- `src/app/page.tsx` — the only route and the auth gate (see Auth).
- `src/app/globals.css` — Tailwind import and the palette/surface tokens as
  CSS variables.
- `src/lib/kanban.ts` — pure domain types and logic, no I/O:
  `Card` (`title`, `details`, `priority`, `dueDate`, `labelIds`,
  `checklist`), `Label` (`name`, `color` from `LABEL_COLORS`),
  `ChecklistItem`, `Column`, `BoardData` (`id`, `name`, `description`,
  `labels`, `columns`, `cards`), `BoardSummary`; `moveCard(columns, activeId,
  overId)` (drag-and-drop reorder/move), `dueStatus(dueDate, today)`
  (`overdue` / `today` / `upcoming`), `toIsoDate`, `addDays`,
  `cardMatches(card, query)` for search, `CardFilter` / `EMPTY_FILTER` /
  `cardPassesFilter(card, filter, today)` / `activeFilterCount`, and
  `checklistProgress(card)`.
- `src/lib/api.ts` — the board API client. Converts the backend's nested,
  snake_case shapes to `BoardData` (`toBoardData`, `toCard`) and back
  (`due_date`). Functions for boards (`fetchBoards`, `createBoard`,
  `fetchBoard`, `updateBoard`, `deleteBoard`), columns (`addColumn`,
  `renameColumn`, `deleteColumn`, `moveColumn`), cards (`addCard`,
  `updateCard` — sends only the fields in the patch, `deleteCard`, `moveCard`),
  labels (`createLabel`, `updateLabel`, `deleteLabel`), checklist items
  (`addChecklistItem`, `updateChecklistItem`, `deleteChecklistItem`) and
  `sendChatMessage(boardId, message, history)`. Failures throw
  `ApiError` (`status` + the backend's `detail`). A 401 from any call also
  invokes the handler registered with `setUnauthorizedHandler`, which
  `page.tsx` uses to drop back to the sign-in screen when a session expires
  (sessions end on every server restart unless `SESSION_SECRET` is set).
  Imported as `import * as api` at call sites to avoid clashing with
  `kanban.ts`'s `moveCard`.
- `src/lib/auth.ts` — `fetchSession`, `login`, `register`, `logout`,
  `changePassword`, `deleteAccount`. Deliberately uses plain `fetch`, not
  `api.ts`'s `request`, because 401/403 here are expected answers (wrong
  password), not an expired session; each maps status codes to a
  user-facing error message.
- `src/components/AuthForm.tsx` — sign-in form that toggles to "Create
  account" (register) mode.
- `src/components/Workspace.tsx` — the signed-in shell. Loads the board
  list, picks the active board (the one last opened, remembered per user in
  `localStorage`, else the first), and renders the one-row app bar: title,
  `BoardSwitcher`, show/hide assistant, username, account settings, log out.
  Renders `KanbanBoard` keyed by board id (switching boards remounts it), an
  empty state with "Create a board" when the user has none, and the create
  board / account dialogs. Handles `onBoardRenamed` / `onBoardDeleted` from
  the board to keep the switcher list current.
- `src/components/BoardSwitcher.tsx` — dropdown of the user's boards (with
  card counts, refreshed each time it opens) plus "New board".
- `src/components/KanbanBoard.tsx` — one board. Fetches it by `boardId`
  (loading / error-with-retry / loaded), renders the board toolbar (name,
  description and counts, board settings, `mutationError` banner, card
  search, `FilterMenu`, manage labels, add column) and the columns grid plus
  `ChatSidebar`. Owns all board mutations and the dialogs: card details,
  labels, add column, delete column and delete board confirmations, board
  settings. While a search or filter is active, drag and drop is disabled
  (indices in a filtered list would be wrong). Drag and drop works with the
  pointer and with the keyboard (`KeyboardSensor`: Space picks up and drops,
  arrow keys move, Escape cancels; Enter stays free to open a card), and the
  live-region announcements use card and column names instead of ids.
  Layout: at `lg:` the workspace is fixed to the viewport; columns share the
  width as grid tracks (`auto-cols-[minmax(200px,1fr)]`), each column scrolls
  its own cards, and the board scrolls horizontally only when the minimum
  width no longer fits. Below `lg:` columns become a horizontal scroll-snap
  strip with the assistant stacked underneath. The assistant is hidden with
  the `hidden` attribute rather than unmounted, so its transcript survives
  hide/show.
- `src/components/KanbanColumn.tsx` — droppable column: editable title
  (controlled; persists on blur only if the title actually changed, and a
  cleared title reverts), card count, "+" (`Add a card`) opening
  `NewCardForm` at the top of the list, and a "Column actions" menu (move
  left, move right, delete).
- `src/components/KanbanCard.tsx` — sortable card. Clicking it (or Enter)
  opens the card dialog; Enter's keydown is `preventDefault`ed, because
  otherwise the rest of the keystroke lands in the dialog's autofocused title
  and submits the form. A trash icon (`Delete <title>`) deletes the card
  immediately. Shows label chips and priority, due-date and checklist
  progress badges via the shared `CardBody`, which `KanbanCardPreview` (the
  `DragOverlay` clone) also uses.
- `src/components/CardDialog.tsx` — edit title, details, priority, due date
  and labels (saved together with Save), plus the checklist, whose changes
  save immediately: add (the input clears on submit so typing the next item
  during the save isn't lost; restored on failure), tick (optimistic, rolled
  back on failure), delete. Stays open with an error if saving fails.
- `src/components/LabelChip.tsx` — colored label pill; `LABEL_COLOR_CLASSES`
  maps the palette color names to CSS-variable tints.
- `src/components/LabelsDialog.tsx` — create, rename (on blur), recolor and
  delete a board's labels; explains duplicate names (409).
- `src/components/FilterMenu.tsx` — priority, label and due-date filters
  with an active-count badge and "Clear filters".
- `src/components/NewCardForm.tsx` — inline title/details form; stays open
  with the typed input if the add fails.
- `src/components/BoardDialog.tsx` — create/edit board (name, description),
  optional delete action.
- `src/components/AccountDialog.tsx` — change password; delete account
  (requires the password).
- `src/components/ChatSidebar.tsx` — AI chat for the current board. Owns the
  transcript as local state and sends it as `history` each turn (the backend
  is stateless and trims history itself). Always applies the board returned
  by the reply via `onBoardUpdate`. Scrolls to the newest message.
- `src/components/Modal.tsx` — accessible dialog (`role="dialog"`, labelled
  by its title, Escape/backdrop to close), `ConfirmDialog`, and shared form
  field classes. `window.confirm` is avoided (jsdom does not implement it).
- `src/components/IconButton.tsx` — round icon-only button whose `label` is
  both the `aria-label` and the tooltip, so tests and assistive tech find
  icon buttons by name.

## Auth

`page.tsx` is a three-state gate (`loading` / `anonymous` / `authenticated`)
driven by `fetchSession()` on mount. `loading` renders nothing (also what the
static prerender contains), so board content never flashes before auth is
confirmed. `anonymous` renders `AuthForm`; `authenticated` renders
`Workspace` keyed by username. Log out, account deletion and any 401 from
`api.ts` return to `anonymous`. The backend's signed session cookie is the
only source of truth.

## Persistence

The strategy differs by interaction, deliberately:
- **Typing a column title / dragging a card / moving a column / ticking a
  checklist item** need instant feedback: local state changes first and the API call runs in the
  background. A failed call sets `mutationError` and re-fetches the board to
  resync.
- **Add/edit/delete card, add/delete column, board changes** are discrete
  actions where a short wait is imperceptible: they `await` the API before
  touching local state (adding needs the server-assigned id anyway).

## Testing

- `npm run test:all` runs lint, unit tests and the mocked e2e suite. Run the
  full-stack suite separately.
- Unit/component (Vitest, jsdom): `*.test.ts(x)` next to the code. Coverage:
  `npx vitest run --coverage`. Components mock `@/lib/api` / `@/lib/auth`
  with `vi.mock`; `src/lib/api.test.ts` and `src/lib/auth.test.ts` stub
  `fetch` to check paths, methods, payload mapping and error handling. Shared
  builders live in `src/test/fixtures.ts` (`buildCard`, `buildBoard`,
  `buildLabeledBoard`). `vi.mock` automocks `ApiError`, so tests that need a
  status build it with `Object.assign(new api.ApiError(...), { status })`.
- Mocked e2e (`npm run test:e2e`, Playwright against `next dev` on
  `127.0.0.1:3000`): `tests/support/mockApi.ts` is a stateful in-memory fake
  of the whole backend installed with `page.route("**/api/**")`, so flows
  can create, edit and reload realistically. `MockApi.install(page,
  { signedInAs })` starts signed in or out; `expireSessionOnNextRequest`
  simulates a lapsed session.
  - `tests/login.spec.ts` — sign in/out, bad credentials, registration,
    taken username, expired session returning to sign-in.
  - `tests/kanban.spec.ts` — add card, drag between columns, edit priority
    and due date (survives reload), search, add/reorder/delete columns, chat.
  - `tests/boards.spec.ts` — create, switch, remember last board, rename,
    delete, empty state.
  - `tests/cards.spec.ts` — label a card and filter by label, manage labels
    (including duplicates), checklist progress surviving reload, Enter opens
    a card without saving it, keyboard drag and drop (waits on the live-region
    announcements between key presses rather than sleeping).
  - Note: `next dev` injects its own `role="alert"` route announcer, and a
    card's accessible name contains its delete button's name; prefer text or
    `exact: true` selectors in those cases.
- Full-stack e2e (`npm run test:e2e:full` or `scripts/test-e2e-full.sh`):
  builds and runs the real Docker image, waits for `/api/health`, runs
  `tests-full-stack/` serially (`workers: 1`, shared database) with no
  mocks. `board-persistence.spec.ts` (edits survive reload),
  `ai-chat.spec.ts` (live OpenRouter call adds a card; waits for the reply
  up to the backend's worst-case model time and retries the message once,
  since the live model occasionally proposes an operation the backend
  rejects), `accounts.spec.ts`
  (two registered users cannot see each other's boards; board creation,
  password change, account deletion), `card-details.spec.ts` (labels,
  checklist and label filter persist against real SQLite).
- `src/test/vitest.d.ts` must reference `vitest/globals` and
  `@testing-library/jest-dom/vitest`; the bare specifiers leave the test
  globals untyped, which only fails in `next build`'s TypeScript pass.

## Conventions to follow when extending this code

- Keep board logic as pure functions in `src/lib/kanban.ts` so it stays unit
  testable without rendering.
- Board data lives in `KanbanBoard`; child components are presentational and
  report changes through callback props.
- Use the CSS variables in `globals.css` for color, not hardcoded hex values.
- Give every icon-only control a label through `IconButton`.
- `data-testid` attributes (`column-${id}`, `card-${id}`, `priority-badge`,
  `due-badge`, `checklist-progress`) are used by tests; keep them stable.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Database

Schema definition with an example row set: `docs/schema.json`. This document
explains the design decisions behind it.

## Why SQLite

Per root `AGENTS.md`: the whole app runs in a single local Docker container
for the MVP, with no separate database service. SQLite is a single file,
needs no server process, and Python's standard library talks to it directly
— the simplest option that still gives us real relational storage and
survives container restarts (the file lives on disk, not in memory). The
file is created on first run if it doesn't exist (Part 6).

## Tables

- **`users`** — one row per signed-in user. `id`, `username`, `password`.
  Part 4's login route still checks the hardcoded `user`/`password` in code,
  not this column — it's stored (plaintext, matching the hardcoded value)
  so the table is already a complete source of truth once real multi-user
  auth replaces that hardcoded check. At that point `password` should hold a
  proper hash, not plaintext — worth calling out now since it's easy to miss
  later.
- **`boards`** — one row per board. `id`, `user_id` (FK → `users.id`).
- **`columns`** — a board's columns. `id`, `board_id` (FK → `boards.id`),
  `title`, `position`.
- **`cards`** — a column's cards. `id`, `column_id` (FK → `columns.id`),
  `title`, `details`, `position`.

IDs are `INTEGER PRIMARY KEY` (SQLite rowids) for simplicity on the backend.
The API layer (Part 6) will expose them to the frontend as opaque strings
(e.g. `"col-3"`, `"card-12"`) — the frontend's `Card`/`Column` types already
treat `id` as an opaque string (`frontend/src/lib/kanban.ts`), so this is a
transparent change from the frontend's point of view; nothing there compares
or parses ids as numbers.

## "One board per user" (MVP) vs. multi-board (future)

Root `AGENTS.md` lists both "hardcoded single user" and "1 board per user"
explicitly as MVP limitations, with the database explicitly called out as
needing to support more users later. So `boards.user_id` is a plain FK, not
a unique one — nothing in the schema stops a user from having multiple
boards. The MVP's "exactly one board" rule is an application-level
convention (Part 6: get-or-create the current user's board), not a schema
constraint. That means adding multi-board support later is a
backend/frontend feature change, not a migration.

## Ordering

- **Columns**: per root `AGENTS.md`, the board's columns are fixed — only
  the title can be edited, columns are never added, removed, or reordered.
  So `columns.position` is assigned once, when the board is created, and
  never changes afterward.
- **Cards**: `cards.position` determines render order within `column_id`.
  Positions only need to be monotonically increasing within a column, not
  contiguous — deleting a card can leave gaps, that's fine. Adding a card
  appends at the end of its column. Moving a card (reorder within a column,
  or to a different column) means the backend rewrites `column_id` and
  `position` for the moved card and renumbers the affected column(s) —
  the same operation `moveCard` in `frontend/src/lib/kanban.ts` already
  performs today on in-memory arrays; Part 6 reimplements that logic against
  these rows.

## Coverage check against the current frontend

Walked `frontend/src/lib/kanban.ts`'s `BoardData` shape and every action the
demo UI supports against this schema:

| Frontend shape / action | Schema |
| --- | --- |
| `Card { id, title, details }` | `cards` row |
| `Column { id, title, cardIds }` | `columns` row; `cardIds` order is `cards` rows for that `column_id` ordered by `position` — same information, normalized |
| `BoardData { columns, cards }` | one `boards` row + its `columns`/`cards` rows |
| Rename column | `UPDATE columns SET title = ?` |
| Add card | `INSERT INTO cards (...)` with `position` after the current max in that column |
| Delete card | `DELETE FROM cards WHERE id = ?` |
| Reorder card within a column | `UPDATE cards SET position = ...` for the moved card and the cards between its old and new spot |
| Move card to another column | `UPDATE cards SET column_id = ?, position = ?` plus renumbering in the source and destination columns |

Nothing in the current demo's data or interactions is lost by this schema.

## Seeding

`docs/schema.json`'s example rows are exactly `frontend/src/lib/kanban.ts`'s
`initialData` translated to rows. Part 6 will use this same data to seed a
freshly created database, so the persisted app starts from the same board
the standalone demo does today.

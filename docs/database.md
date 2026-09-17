# Database

SQLite, created on first run (`backend/app/db.py`). Example rows are in
`docs/schema.json`.

## Why SQLite

The app runs as a single local Docker container with no separate database
service. SQLite is a single file, needs no server, and Python's standard
library talks to it directly.

## Tables

- **`users`** — `id`, `username` (unique, case-insensitive via `COLLATE
  NOCASE`), `password_hash` (scrypt, see `backend/app/security.py`; never
  plaintext), `created_at`.
- **`boards`** — `id`, `user_id` → `users.id`, `name`, `description`,
  `created_at`. A user can have any number of boards.
- **`columns`** — `id`, `board_id` → `boards.id`, `title`, `position`.
- **`cards`** — `id`, `column_id` → `columns.id`, `title`, `details`,
  `priority` (`none`/`low`/`medium`/`high`, enforced by a `CHECK`),
  `due_date` (ISO `YYYY-MM-DD` text or NULL), `position`, `created_at`.
- **`labels`** — `id`, `board_id` → `boards.id`, `name` (unique per board,
  case-insensitive), `color` (`yellow`/`blue`/`purple`/`navy`/`gray`, the
  app's palette names, enforced by a `CHECK`).
- **`card_labels`** — `card_id` → `cards.id`, `label_id` → `labels.id`;
  composite primary key. Labels are board-scoped, so a card may only carry
  labels from its own board (enforced in `board.py`, not the schema).
- **`checklist_items`** — `id`, `card_id` → `cards.id`, `text`, `done`
  (0/1), `position`.

Every foreign key is `ON DELETE CASCADE`, and `PRAGMA foreign_keys = ON` is
set on each connection: deleting a user removes their boards, columns and
cards; deleting a board or column removes everything under it. Each foreign
key column is indexed.

IDs are integer primary keys internally and opaque strings in the API
(`board-1`, `col-3`, `card-12`); the frontend never parses them.

## Ownership

Only `boards.user_id` records ownership. Columns and cards are owned through
their board, so every API lookup of a column or card joins up to `boards`
and filters on the signed-in user. A request for another user's id behaves
exactly like a request for a nonexistent one (404).

## Ordering

`columns.position` orders columns within a board and `cards.position` orders
cards within a column. New rows are appended after the current maximum.
Moves and deletes renumber the affected rows to be contiguous from 0, so
positions always match what the UI shows.

## Versioning

`init_db()` records `SCHEMA_VERSION` in `PRAGMA user_version`.

- Version 1: users, boards, columns, cards.
- Version 2: adds `labels`, `card_labels`, `checklist_items`. The upgrade
  from version 1 only adds tables, so `CREATE TABLE IF NOT EXISTS` performs
  it; `tests/test_db.py` checks that existing rows survive.

Databases from the original single-user MVP were never persisted (the
container has no volume), so there is no migration from that layout. A
future change that alters existing tables needs an explicit step keyed on the
stored version.

## Seeding

When the `users` table is empty, `init_db()` creates the demo account
(`user` / `password`) with a "Product Roadmap" board holding the five default
columns, eight example cards, three labels (one applied to the first card)
and a two-item checklist. Every new board, including the starter board
a newly registered user gets, starts with the same five empty columns:
Backlog, Discovery, In Progress, Review, Done.

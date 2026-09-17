import os
import sqlite3
from functools import cache
from pathlib import Path

from app.security import hash_password

DB_PATH = Path(
    os.environ.get("DATABASE_PATH", str(Path(__file__).parent / "data" / "kanban.db"))
)

SCHEMA_VERSION = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);

CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_columns_board_id ON columns(board_id);

CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'none'
        CHECK (priority IN ('none', 'low', 'medium', 'high')),
    due_date TEXT,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cards_column_id ON cards(column_id);

CREATE TABLE IF NOT EXISTS labels (
    id INTEGER PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE,
    color TEXT NOT NULL CHECK (color IN ('yellow', 'blue', 'purple', 'navy', 'gray')),
    UNIQUE (board_id, name)
);

CREATE TABLE IF NOT EXISTS card_labels (
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_card_labels_label_id ON card_labels(label_id);

CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_card_id ON checklist_items(card_id);
"""

DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
DEMO_BOARD_NAME = "Product Roadmap"

# (title, details, priority, due_date) per column
DEMO_CARDS: dict[str, list[tuple[str, str, str, str | None]]] = {
    "Backlog": [
        (
            "Align roadmap themes",
            "Draft quarterly themes with impact statements and metrics.",
            "high",
            None,
        ),
        (
            "Gather customer signals",
            "Review support tags, sales notes, and churn feedback.",
            "medium",
            None,
        ),
    ],
    "Discovery": [
        (
            "Prototype analytics view",
            "Sketch initial dashboard layout and key drill-downs.",
            "none",
            None,
        ),
    ],
    "In Progress": [
        (
            "Refine status language",
            "Standardize column labels and tone across the board.",
            "low",
            None,
        ),
        (
            "Design card layout",
            "Add hierarchy and spacing for scanning dense lists.",
            "none",
            None,
        ),
    ],
    "Review": [
        ("QA micro-interactions", "Verify hover, focus, and loading states.", "none", None),
    ],
    "Done": [
        (
            "Ship marketing page",
            "Final copy approved and asset pack delivered.",
            "none",
            None,
        ),
        (
            "Close onboarding sprint",
            "Document release notes and share internally.",
            "none",
            None,
        ),
    ],
}


DEMO_LABELS = [("Strategy", "purple"), ("Research", "blue"), ("Design", "yellow")]

DEMO_CHECKLIST = [("Collect last quarter's metrics", 1), ("Draft three themes", 0)]


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        if conn.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None:
            _seed_demo(conn)
        conn.commit()
    finally:
        conn.close()


@cache
def _demo_password_hash() -> str:
    return hash_password(DEMO_PASSWORD)


def _seed_demo(conn: sqlite3.Connection) -> None:
    user_id = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (DEMO_USERNAME, _demo_password_hash()),
    ).lastrowid
    board_id = create_board(conn, user_id, DEMO_BOARD_NAME)
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ?", (board_id,)
    ).fetchall()
    for column in columns:
        for position, (title, details, priority, due_date) in enumerate(
            DEMO_CARDS[column["title"]]
        ):
            conn.execute(
                "INSERT INTO cards (column_id, title, details, priority, due_date, "
                "position) VALUES (?, ?, ?, ?, ?, ?)",
                (column["id"], title, details, priority, due_date, position),
            )
    label_ids = {
        name: conn.execute(
            "INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)",
            (board_id, name, color),
        ).lastrowid
        for name, color in DEMO_LABELS
    }
    first_card = conn.execute(
        "SELECT cards.id FROM cards JOIN columns ON columns.id = cards.column_id "
        "WHERE columns.board_id = ? ORDER BY columns.position, cards.position LIMIT 1",
        (board_id,),
    ).fetchone()["id"]
    conn.execute(
        "INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)",
        (first_card, label_ids["Strategy"]),
    )
    conn.executemany(
        "INSERT INTO checklist_items (card_id, text, done, position) VALUES (?, ?, ?, ?)",
        [
            (first_card, text, done, position)
            for position, (text, done) in enumerate(DEMO_CHECKLIST)
        ],
    )


def create_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    user_id = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(password)),
    ).lastrowid
    create_board(conn, user_id, "My First Board")
    return user_id


def create_board(
    conn: sqlite3.Connection, user_id: int, name: str, description: str = ""
) -> int:
    board_id = conn.execute(
        "INSERT INTO boards (user_id, name, description) VALUES (?, ?, ?)",
        (user_id, name, description),
    ).lastrowid
    conn.executemany(
        "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
        [(board_id, title, position) for position, title in enumerate(DEFAULT_COLUMNS)],
    )
    return board_id


def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

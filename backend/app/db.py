import os
import sqlite3
from pathlib import Path

from app.auth import PASSWORD, USERNAME

DB_PATH = Path(
    os.environ.get("DATABASE_PATH", str(Path(__file__).parent / "data" / "kanban.db"))
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES boards(id),
    title TEXT NOT NULL,
    position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    column_id INTEGER NOT NULL REFERENCES columns(id),
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
);
"""

SEED_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]

SEED_CARDS: dict[str, list[tuple[str, str]]] = {
    "Backlog": [
        (
            "Align roadmap themes",
            "Draft quarterly themes with impact statements and metrics.",
        ),
        (
            "Gather customer signals",
            "Review support tags, sales notes, and churn feedback.",
        ),
    ],
    "Discovery": [
        (
            "Prototype analytics view",
            "Sketch initial dashboard layout and key drill-downs.",
        ),
    ],
    "In Progress": [
        (
            "Refine status language",
            "Standardize column labels and tone across the board.",
        ),
        ("Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ],
    "Review": [
        ("QA micro-interactions", "Verify hover, focus, and loading states."),
    ],
    "Done": [
        (
            "Ship marketing page",
            "Final copy approved and asset pack delivered.",
        ),
        (
            "Close onboarding sprint",
            "Document release notes and share internally.",
        ),
    ],
}


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
        if conn.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None:
            _seed(conn)
        conn.commit()
    finally:
        conn.close()


def _seed(conn: sqlite3.Connection) -> None:
    user_id = conn.execute(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        (USERNAME, PASSWORD),
    ).lastrowid
    board_id = conn.execute(
        "INSERT INTO boards (user_id) VALUES (?)", (user_id,)
    ).lastrowid
    for position, title in enumerate(SEED_COLUMNS):
        column_id = conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, title, position),
        ).lastrowid
        for card_position, (card_title, details) in enumerate(SEED_CARDS[title]):
            conn.execute(
                "INSERT INTO cards (column_id, title, details, position) "
                "VALUES (?, ?, ?, ?)",
                (column_id, card_title, details, card_position),
            )


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

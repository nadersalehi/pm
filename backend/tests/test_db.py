from app.db import SCHEMA_VERSION, get_connection, init_db


def count(db, table: str) -> int:
    return db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


def test_init_db_sets_schema_version(db) -> None:
    assert db.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION


def test_init_db_is_idempotent(db) -> None:
    before = {table: count(db, table) for table in ("users", "boards", "columns", "cards")}
    init_db()
    after = {table: count(db, table) for table in ("users", "boards", "columns", "cards")}
    assert after == before == {"users": 1, "boards": 1, "columns": 5, "cards": 8}
    assert count(db, "labels") == 3
    assert count(db, "checklist_items") == 2


def test_demo_password_is_not_stored_in_plaintext(db) -> None:
    stored = db.execute("SELECT password_hash FROM users").fetchone()[0]
    assert stored.startswith("scrypt$")
    assert "password" not in stored.split("$")


def test_upgrades_a_version_1_database_without_losing_data() -> None:
    conn = get_connection()
    conn.executescript(
        "DROP TABLE checklist_items; DROP TABLE card_labels; DROP TABLE labels;"
        "PRAGMA user_version = 1;"
    )
    conn.execute("UPDATE cards SET title = 'Kept from v1' WHERE id = 1")
    conn.commit()
    conn.close()

    init_db()

    conn = get_connection()
    try:
        assert conn.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
        assert conn.execute("SELECT title FROM cards WHERE id = 1").fetchone()[0] == "Kept from v1"
        assert count(conn, "cards") == 8
        assert count(conn, "labels") == 0
        conn.execute("INSERT INTO labels (board_id, name, color) VALUES (1, 'New', 'blue')")
    finally:
        conn.close()

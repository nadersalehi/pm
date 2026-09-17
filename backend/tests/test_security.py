from app.security import hash_password, verify_password


def test_hash_round_trip() -> None:
    stored = hash_password("correct horse")
    assert stored.startswith("scrypt$")
    assert "correct horse" not in stored
    assert verify_password("correct horse", stored)
    assert not verify_password("wrong horse", stored)


def test_same_password_hashes_differently() -> None:
    assert hash_password("same") != hash_password("same")

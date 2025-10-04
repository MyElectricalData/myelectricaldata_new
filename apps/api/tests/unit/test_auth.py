import pytest
from src.utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    decode_access_token,
    generate_client_id,
    generate_client_secret,
)


def test_password_hashing():
    """Test password hashing and verification"""
    password = "test_password_123"
    hashed = get_password_hash(password)

    assert hashed != password
    assert verify_password(password, hashed)
    assert not verify_password("wrong_password", hashed)


def test_jwt_token():
    """Test JWT token creation and decoding"""
    data = {"sub": "user_id_123", "email": "test@example.com"}
    token = create_access_token(data)

    assert isinstance(token, str)
    assert len(token) > 0

    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == "user_id_123"
    assert decoded["email"] == "test@example.com"


def test_invalid_jwt_token():
    """Test decoding invalid JWT token"""
    invalid_token = "invalid.token.here"
    decoded = decode_access_token(invalid_token)

    assert decoded is None


def test_client_id_generation():
    """Test client_id generation"""
    client_id_1 = generate_client_id()
    client_id_2 = generate_client_id()

    assert client_id_1.startswith("cli_")
    assert client_id_2.startswith("cli_")
    assert client_id_1 != client_id_2
    assert len(client_id_1) > 20


def test_client_secret_generation():
    """Test client_secret generation"""
    secret_1 = generate_client_secret()
    secret_2 = generate_client_secret()

    assert secret_1 != secret_2
    assert len(secret_1) > 50
    assert len(secret_2) > 50

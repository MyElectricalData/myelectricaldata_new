import secrets
import bcrypt
from datetime import datetime, timedelta, UTC
from typing import Optional, Any, cast
from jose import JWTError, jwt
from ..config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return cast(str, encoded_jwt)


def decode_access_token(token: str) -> dict[Any, Any] | None:
    """Decode JWT access token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return cast(dict[Any, Any], payload)
    except JWTError:
        return None


def generate_client_id() -> str:
    """Generate a unique client_id"""
    return f"cli_{secrets.token_urlsafe(32)}"


def generate_client_secret() -> str:
    """Generate a secure client_secret"""
    return secrets.token_urlsafe(64)


def generate_api_key() -> str:
    """Generate API key for authentication"""
    return secrets.token_urlsafe(48)

import re
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    turnstile_token: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password meets security requirements.

        Requirements:
        - Minimum 8 characters (enforced by Field)
        - At least one uppercase letter
        - At least one lowercase letter
        - At least one digit
        """
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PDLCreate(BaseModel):
    usage_point_id: str = Field(..., min_length=14, max_length=14, pattern=r"^\d{14}$")
    name: Optional[str] = Field(None, max_length=100)


class AdminPDLCreate(BaseModel):
    """Admin-only: Add PDL to any user without consent"""
    user_email: EmailStr
    usage_point_id: str = Field(..., min_length=14, max_length=14, pattern=r"^\d{14}$")
    name: Optional[str] = Field(None, max_length=100)


class OAuthCallbackRequest(BaseModel):
    code: str
    state: Optional[str] = None

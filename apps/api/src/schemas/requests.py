from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    turnstile_token: Optional[str] = None


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

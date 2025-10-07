from typing import Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class ErrorDetail(BaseModel):
    code: str
    message: str
    field: Optional[str] = None


class APIResponse(BaseModel):
    """Standard API response following api-design.json"""

    success: bool
    data: Optional[Any] = None
    error: Optional[ErrorDetail] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class HealthCheckResponse(BaseModel):
    status: str = "ok"
    version: str = "1.5.15"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class UserResponse(BaseModel):
    id: str
    email: str
    client_id: str
    is_active: bool
    created_at: datetime


class ClientCredentials(BaseModel):
    client_id: str
    client_secret: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PDLResponse(BaseModel):
    id: str
    usage_point_id: str
    name: Optional[str] = None
    created_at: datetime
    display_order: Optional[int] = None
    subscribed_power: Optional[int] = None
    offpeak_hours: Optional[dict] = None


class CacheDeleteResponse(BaseModel):
    success: bool
    deleted_keys: int
    message: str

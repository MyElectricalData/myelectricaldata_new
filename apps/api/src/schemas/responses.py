from typing import Any, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime, date


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
    offpeak_hours: Optional[Union[list[str], dict]] = None  # Array format or legacy object format
    pricing_option: Optional[str] = None  # BASE, HC_HP, TEMPO, EJP, HC_WEEKEND
    has_consumption: bool = True
    has_production: bool = False
    is_active: bool = True
    oldest_available_data_date: Optional[date] = None  # Oldest date where Enedis has data (meter activation)
    activation_date: Optional[date] = None  # Contract activation date (from Enedis)
    linked_production_pdl_id: Optional[str] = None  # Link to production PDL for combined graphs
    selected_offer_id: Optional[str] = None  # Selected energy offer ID


class CacheDeleteResponse(BaseModel):
    success: bool
    deleted_keys: int
    message: str

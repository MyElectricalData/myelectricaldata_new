"""Pydantic schemas for gateway API responses."""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DetailedDataPoint(BaseModel):
    """A single data point for detailed (30-min) data."""

    timestamp: datetime
    value: float = Field(ge=0)


class ConsumptionDailyData(BaseModel):
    """Daily consumption data."""

    date: date
    value: float = Field(ge=0, description="Consumption in kWh")
    hc: Optional[float] = Field(default=None, ge=0, description="Heures Creuses in kWh")
    hp: Optional[float] = Field(default=None, ge=0, description="Heures Pleines in kWh")


class ConsumptionResponse(BaseModel):
    """Response schema for consumption data from the gateway."""

    usage_point_id: str = Field(description="PDL identifier")
    start: date
    end: date
    unit: str = Field(default="kWh")
    data: List[ConsumptionDailyData]


class ProductionDailyData(BaseModel):
    """Daily production data."""

    date: date
    value: float = Field(ge=0, description="Production in kWh")


class ProductionResponse(BaseModel):
    """Response schema for production data from the gateway."""

    usage_point_id: str = Field(description="PDL identifier")
    start: date
    end: date
    unit: str = Field(default="kWh")
    data: List[ProductionDailyData]


class MaxPowerData(BaseModel):
    """Max power data."""

    date: date
    value: float = Field(ge=0, description="Max power in kVA")


class MaxPowerResponse(BaseModel):
    """Response schema for max power data from the gateway."""

    usage_point_id: str
    start: date
    end: date
    unit: str = Field(default="kVA")
    data: List[MaxPowerData]


class PDLInfoResponse(BaseModel):
    """Response schema for PDL information from the gateway."""

    id: Optional[str] = Field(default=None, description="PDL database ID (UUID)")
    usage_point_id: str = Field(description="14-digit PDL identifier")
    name: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    subscribed_power: Optional[int] = None
    offpeak_hours: Optional[List[str]] = None
    pricing_option: Optional[str] = None
    tariff_option: Optional[str] = None
    has_consumption: bool = True
    has_production: bool = False
    is_active: bool = True
    contract_status: Optional[str] = None
    created_at: Optional[datetime] = None
    display_order: Optional[int] = None
    oldest_available_data_date: Optional[date] = None
    activation_date: Optional[date] = None
    linked_production_pdl_id: Optional[str] = None
    selected_offer_id: Optional[str] = None


class StatusResponse(BaseModel):
    """Response schema for gateway status."""

    status: str
    gateway_version: Optional[str] = None
    pdl_count: int
    last_sync: Optional[datetime] = None


class DetailedConsumptionResponse(BaseModel):
    """Response schema for detailed (30-min) consumption data."""

    usage_point_id: str
    date: date
    interval: str = Field(default="30min")
    data: List[DetailedDataPoint]


class DetailedProductionResponse(BaseModel):
    """Response schema for detailed (30-min) production data."""

    usage_point_id: str
    date: date
    interval: str = Field(default="30min")
    data: List[DetailedDataPoint]

"""
EcoWatt data model for storing RTE EcoWatt signals
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, String, DateTime, Integer, JSON, UniqueConstraint, Index
from pydantic import BaseModel

from .base import Base


class EcoWatt(Base):
    """Model for storing EcoWatt signals from RTE"""

    __tablename__ = 'ecowatt'

    id = Column(Integer, primary_key=True, index=True)

    # Date and time information
    generation_datetime = Column(DateTime, nullable=False)  # When the signal was generated
    periode = Column(DateTime, nullable=False)  # The date being forecasted

    # Signal data
    hdebut = Column(Integer, nullable=False)  # Start hour (0-23)
    hfin = Column(Integer, nullable=False)  # End hour (0-23)
    pas = Column(Integer, default=60)  # Step in minutes

    # Main signal value
    dvalue = Column(Integer, nullable=False)  # Signal value (1=Vert, 2=Orange, 3=Rouge)
    message = Column(String, nullable=True)  # Optional message

    # Hourly values (24 values, one for each hour)
    values = Column(JSON, nullable=False)  # Array of 24 hourly values

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Ensure unique entries per day
    __table_args__ = (
        UniqueConstraint('periode', name='unique_ecowatt_periode'),
        Index('idx_ecowatt_periode', 'periode'),
    )


# Pydantic models for API responses
class HourlyValue(BaseModel):
    """Hourly value with hour and signal level"""
    hour: int  # 0-23 (0=minuit, 1=1h, etc.)
    value: int  # Signal value (0-3)


class EcoWattBase(BaseModel):
    """Base EcoWatt model"""
    periode: datetime
    dvalue: int
    message: Optional[str] = None
    values: List[int]  # Raw array of 24 hourly values
    hdebut: int
    hfin: int

    class Config:
        from_attributes = True


class EcoWattResponse(EcoWattBase):
    """Response model with additional fields"""
    id: int
    generation_datetime: datetime
    created_at: datetime
    updated_at: datetime

    @property
    def hourly_values(self) -> List[HourlyValue]:
        """Convert values array to list of hourly values with hour labels"""
        return [HourlyValue(hour=i, value=v) for i, v in enumerate(self.values)]


class EcoWattCreate(BaseModel):
    """Model for creating EcoWatt entries"""
    generation_datetime: datetime
    periode: datetime
    hdebut: int
    hfin: int
    pas: int = 60
    dvalue: int
    message: Optional[str] = None
    values: List[int]
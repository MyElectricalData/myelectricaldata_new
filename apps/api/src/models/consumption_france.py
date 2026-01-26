"""
Consumption France data model for storing RTE national consumption data
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import Column, String, DateTime, Integer, Float, Index
from pydantic import BaseModel

from .base import Base


class ConsumptionFrance(Base):
    """Model for storing French national consumption data from RTE"""

    __tablename__ = "consumption_france"

    id = Column(Integer, primary_key=True, index=True)

    # Type de donnée : REALISED, ID (intraday), D-1, D-2
    type = Column(String(20), nullable=False)

    # Période
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)

    # Valeur en MW
    value = Column(Float, nullable=False)

    # Date de mise à jour par RTE
    updated_date = Column(DateTime, nullable=True)

    # Métadonnées
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_consumption_france_type_start", "type", "start_date"),
        Index("idx_consumption_france_start", "start_date"),
    )


# Pydantic models for API responses
class ConsumptionFranceValue(BaseModel):
    """Single consumption value"""

    start_date: datetime
    end_date: datetime
    value: float  # MW
    updated_date: Optional[datetime] = None


class ConsumptionFranceData(BaseModel):
    """Consumption data for a type (REALISED, D-1, etc.)"""

    type: str
    start_date: datetime
    end_date: datetime
    values: List[ConsumptionFranceValue]


class ConsumptionFranceResponse(BaseModel):
    """Response model for consumption data"""

    short_term: List[ConsumptionFranceData]
    cached_at: Optional[datetime] = None

    class Config:
        from_attributes = True

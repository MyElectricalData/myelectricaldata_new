from sqlalchemy import Column, String, DateTime, Enum as SQLEnum
from datetime import datetime, UTC
from .base import Base
import enum


class TempoColor(str, enum.Enum):
    """TEMPO day colors"""
    BLUE = "BLUE"
    WHITE = "WHITE"
    RED = "RED"


class TempoDay(Base):
    """Store TEMPO calendar days from RTE API"""
    __tablename__ = "tempo_days"

    id = Column(String, primary_key=True)  # Format: YYYY-MM-DD
    date = Column(DateTime(timezone=True), nullable=False, unique=True, index=True)
    color = Column(SQLEnum(TempoColor), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
    rte_updated_date = Column(DateTime(timezone=True), nullable=True)  # Date from RTE API

    def __repr__(self):
        return f"<TempoDay(date={self.date.strftime('%Y-%m-%d')}, color={self.color})>"

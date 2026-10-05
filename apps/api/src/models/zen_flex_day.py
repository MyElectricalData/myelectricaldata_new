import enum
from datetime import UTC, datetime

from sqlalchemy import Column, Date, DateTime, String
from sqlalchemy import Enum as SQLEnum

from .base import Base


class ZenFlexDayType(str, enum.Enum):
    """Type de jour de l'offre EDF Zen Week-End Option Flex"""

    ECO = "ECO"
    SOBRIETE = "SOBRIETE"
    BONUS = "BONUS"


class ZenFlexDay(Base):
    """Calendrier EDF Zen Flex : un jour Éco, Sobriété ou Bonus (source EDF getOPMStatut)"""

    __tablename__ = "zen_flex_days"

    id = Column(String, primary_key=True)  # Format : YYYY-MM-DD
    # Jour civil (heure de Paris) : une date, pas un instant, pour éviter les décalages UTC
    date = Column(Date, nullable=False, unique=True, index=True)
    day_type = Column(SQLEnum(ZenFlexDayType, native_enum=False, length=10), nullable=False)  # type: ignore
    raw_value = Column(String(32), nullable=True)  # Valeur brute EDF (RAS, ZENF_PM, ZENF_BONIF…)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))

    def __repr__(self) -> str:
        return f"<ZenFlexDay(date={self.id}, day_type={self.day_type})>"

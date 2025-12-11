"""SQLAlchemy models for the local client database."""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class PDL(Base):
    """Point de Livraison (PDL) model.

    Stores information about each PDL retrieved from the gateway.
    """

    __tablename__ = "pdls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usage_point_id: Mapped[str] = mapped_column(String(14), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # Custom name
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    subscribed_power: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # e.g., "6 kVA"
    tariff_option: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # e.g., "BASE", "HC/HP", "TEMPO"
    has_consumption: Mapped[bool] = mapped_column(default=True)
    has_production: Mapped[bool] = mapped_column(default=False)
    linked_production_usage_point_id: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)  # PDL de production lié
    contract_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    consumption_data: Mapped[list["ConsumptionData"]] = relationship(
        "ConsumptionData", back_populates="pdl", cascade="all, delete-orphan"
    )
    production_data: Mapped[list["ProductionData"]] = relationship(
        "ProductionData", back_populates="pdl", cascade="all, delete-orphan"
    )
    sync_status: Mapped[Optional["SyncStatus"]] = relationship(
        "SyncStatus", back_populates="pdl", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<PDL({self.usage_point_id})>"


class ConsumptionData(Base):
    """Daily consumption data model."""

    __tablename__ = "consumption_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pdl_id: Mapped[int] = mapped_column(Integer, ForeignKey("pdls.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    daily_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    hc_kwh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Heures Creuses
    hp_kwh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Heures Pleines
    max_power_kva: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    detailed_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array of 30-min intervals
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    pdl: Mapped["PDL"] = relationship("PDL", back_populates="consumption_data")

    __table_args__ = (
        UniqueConstraint("pdl_id", "date", name="uq_consumption_pdl_date"),
        Index("ix_consumption_pdl_date", "pdl_id", "date"),
    )

    def __repr__(self) -> str:
        return f"<ConsumptionData(pdl_id={self.pdl_id}, date={self.date}, kwh={self.daily_kwh})>"


class ProductionData(Base):
    """Daily production data model."""

    __tablename__ = "production_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pdl_id: Mapped[int] = mapped_column(Integer, ForeignKey("pdls.id", ondelete="CASCADE"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    daily_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    detailed_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array of 30-min intervals
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    pdl: Mapped["PDL"] = relationship("PDL", back_populates="production_data")

    __table_args__ = (
        UniqueConstraint("pdl_id", "date", name="uq_production_pdl_date"),
        Index("ix_production_pdl_date", "pdl_id", "date"),
    )

    def __repr__(self) -> str:
        return f"<ProductionData(pdl_id={self.pdl_id}, date={self.date}, kwh={self.daily_kwh})>"


class SyncStatus(Base):
    """Synchronization status model."""

    __tablename__ = "sync_status"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pdl_id: Mapped[int] = mapped_column(Integer, ForeignKey("pdls.id", ondelete="CASCADE"), unique=True, nullable=False)
    last_sync: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_success: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consumption_last_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    production_last_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    sync_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    pdl: Mapped["PDL"] = relationship("PDL", back_populates="sync_status")

    def __repr__(self) -> str:
        return f"<SyncStatus(pdl_id={self.pdl_id}, last_sync={self.last_sync})>"

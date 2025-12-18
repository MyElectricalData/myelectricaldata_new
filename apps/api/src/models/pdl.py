from __future__ import annotations
import uuid
from typing import TYPE_CHECKING
from sqlalchemy import String, ForeignKey, Integer, JSON, Boolean, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import date
from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .energy_provider import EnergyOffer


class PDL(Base, TimestampMixin):
    __tablename__ = "pdls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    usage_point_id: Mapped[str] = mapped_column(String(14), nullable=False, unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Custom name for PDL
    display_order: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Custom sort order

    # Contract information
    subscribed_power: Mapped[int | None] = mapped_column(Integer, nullable=True)  # kVA
    offpeak_hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # HC schedules by day
    pricing_option: Mapped[str | None] = mapped_column(String(50), nullable=True)  # BASE, HC_HP, TEMPO, EJP, HC_WEEKEND
    has_consumption: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # PDL has consumption data
    has_production: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # PDL has production data
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # PDL is active/enabled
    oldest_available_data_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # Oldest date where Enedis has data (meter activation date)
    activation_date: Mapped[date | None] = mapped_column(Date, nullable=True)  # Contract activation date (from Enedis)
    linked_production_pdl_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("pdls.id", ondelete="SET NULL"), nullable=True)  # Link to production PDL for combined graphs
    selected_offer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("energy_offers.id", ondelete="SET NULL"), nullable=True)  # Selected energy offer

    # Relations
    user: Mapped["User"] = relationship("User", back_populates="pdls")
    linked_production_pdl: Mapped["PDL | None"] = relationship("PDL", remote_side=[id], foreign_keys=[linked_production_pdl_id], uselist=False)
    selected_offer: Mapped["EnergyOffer | None"] = relationship("EnergyOffer", foreign_keys=[selected_offer_id])

    def __repr__(self) -> str:
        return f"<PDL(id={self.id}, usage_point_id={self.usage_point_id})>"

from sqlalchemy import String, Float, Boolean, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, UTC
import uuid
from .base import Base


class EnergyProvider(Base):
    """Energy provider (Fournisseur d'énergie)"""

    __tablename__ = "energy_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False
    )


class EnergyOffer(Base):
    """Energy offer (Offre tarifaire)"""

    __tablename__ = "energy_offers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    provider_id: Mapped[str] = mapped_column(String(36), ForeignKey("energy_providers.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    offer_type: Mapped[str] = mapped_column(String(50), nullable=False)  # BASE, HC_HP, TEMPO, EJP, etc.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pricing
    subscription_price: Mapped[float] = mapped_column(Float, nullable=False)  # €/month
    base_price: Mapped[float | None] = mapped_column(Float, nullable=True)  # €/kWh for BASE
    hc_price: Mapped[float | None] = mapped_column(Float, nullable=True)  # €/kWh for Heures Creuses
    hp_price: Mapped[float | None] = mapped_column(Float, nullable=True)  # €/kWh for Heures Pleines

    # Tempo prices (6 rates)
    tempo_blue_hc: Mapped[float | None] = mapped_column(Float, nullable=True)
    tempo_blue_hp: Mapped[float | None] = mapped_column(Float, nullable=True)
    tempo_white_hc: Mapped[float | None] = mapped_column(Float, nullable=True)
    tempo_white_hp: Mapped[float | None] = mapped_column(Float, nullable=True)
    tempo_red_hc: Mapped[float | None] = mapped_column(Float, nullable=True)
    tempo_red_hp: Mapped[float | None] = mapped_column(Float, nullable=True)

    # EJP prices
    ejp_normal: Mapped[float | None] = mapped_column(Float, nullable=True)
    ejp_peak: Mapped[float | None] = mapped_column(Float, nullable=True)

    # HC/HP schedules (JSON format: {"monday": "22:00-06:00", ...})
    hc_schedules: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Price update tracking
    price_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC), nullable=False
    )


class OfferContribution(Base):
    """Community contribution for energy offers"""

    __tablename__ = "offer_contributions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    contributor_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    contribution_type: Mapped[str] = mapped_column(String(50), nullable=False)  # NEW_PROVIDER, NEW_OFFER, UPDATE_OFFER
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)  # pending, approved, rejected

    # Provider data (for NEW_PROVIDER)
    provider_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_website: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # Offer data
    existing_provider_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("energy_providers.id", ondelete="SET NULL"), nullable=True)
    existing_offer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("energy_offers.id", ondelete="SET NULL"), nullable=True)
    offer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    offer_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pricing data (JSON to store all price fields)
    pricing_data: Mapped[dict] = mapped_column(JSON, nullable=False)

    # HC/HP schedules
    hc_schedules: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Admin review
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

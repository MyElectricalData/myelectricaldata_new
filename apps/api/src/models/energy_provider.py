from sqlalchemy import String, Boolean, DateTime, Text, JSON, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, UTC
from decimal import Decimal
import uuid
from .base import Base


# NOTE: La classe PricingType a été supprimée.
# Les types d'offres sont maintenant gérés via OfferRegistry (auto-discovery)
# dans services/offers/registry.py
# Utiliser: from services.offers import OfferRegistry, get_all_offer_types


class EnergyProvider(Base):
    """Energy provider (Fournisseur d'énergie)"""

    __tablename__ = "energy_providers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    scraper_urls: Mapped[list | None] = mapped_column(JSON, nullable=True)  # List of URLs used by the scraper
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
    offer_type: Mapped[str] = mapped_column(String(50), nullable=False)  # BASE, HC_HP, TEMPO, EJP, etc. (validé via OfferRegistry)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pricing - Using Numeric(10,5) for exact decimal precision (no float rounding)
    subscription_price: Mapped[Decimal] = mapped_column(Numeric(10, 5), nullable=False)  # €/month
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh for BASE
    hc_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh for Heures Creuses
    hp_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh for Heures Pleines

    # Weekend pricing (for offers with different weekend rates)
    base_price_weekend: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh for BASE on weekends
    hp_price_weekend: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh for HP on weekends
    hc_price_weekend: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh for HC on weekends (optional)

    # Tempo prices (6 rates)
    tempo_blue_hc: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)
    tempo_blue_hp: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)
    tempo_white_hc: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)
    tempo_white_hp: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)
    tempo_red_hc: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)
    tempo_red_hp: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)

    # EJP prices
    ejp_normal: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)
    ejp_peak: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)

    # Seasonal pricing (for offers like Enercoop Flexi WATT 2 saisons)
    hc_price_winter: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh HC hiver (nov-mars)
    hp_price_winter: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh HP hiver
    hc_price_summer: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh HC été (avril-oct)
    hp_price_summer: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh HP été

    # Peak day pricing (for offers like Enercoop Flexi WATT 2 saisons Pointe)
    peak_day_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)  # €/kWh for special peak days

    # HC/HP schedules (JSON format: {"monday": "22:00-06:00", ...})
    hc_schedules: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Power (kVA) - Subscription price varies by power
    power_kva: Mapped[int | None] = mapped_column(nullable=True)  # 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

    # Price update tracking
    price_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Validity period for tariff history
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # Date from which this tariff is valid
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # Date until which this tariff is valid (NULL = current)

    # Link to offer page
    offer_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)  # URL to the offer page on provider's website

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
    # Legacy format: single dict with all prices
    # New format: use power_variants instead
    pricing_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Power variants - New format supporting multiple power levels in one contribution
    # Format: [{"power_kva": 6, "subscription_price": 12.34}, {"power_kva": 9, "subscription_price": 15.56}, ...]
    power_variants: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # HC/HP schedules
    hc_schedules: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Power (kVA) - Legacy field, kept for backward compatibility
    # Use power_variants for new contributions
    power_kva: Mapped[int | None] = mapped_column(nullable=True)  # 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

    # Documentation (REQUIRED)
    price_sheet_url: Mapped[str] = mapped_column(String(1024), nullable=False)  # Lien vers la fiche des prix
    screenshot_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)  # Screenshot de la fiche des prix (optionnel)

    # Offer validity date (date de mise en service de l'offre)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # Date from which this tariff is valid

    # Admin review
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)


class ContributionMessage(Base):
    """Messages exchanged about a contribution (admin requests, contributor responses)"""

    __tablename__ = "contribution_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    contribution_id: Mapped[str] = mapped_column(String(36), ForeignKey("offer_contributions.id", ondelete="CASCADE"), nullable=False)
    sender_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message_type: Mapped[str] = mapped_column(String(50), nullable=False)  # info_request, contributor_response
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_from_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)

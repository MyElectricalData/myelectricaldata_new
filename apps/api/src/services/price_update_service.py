"""Service for updating energy provider prices"""
from typing import Dict, List, Any
from datetime import datetime, UTC
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import uuid
import logging

from ..models import EnergyProvider, EnergyOffer
from .price_scrapers import EDFPriceScraper, EnercoopPriceScraper, TotalEnergiesPriceScraper, PrimeoEnergiePriceScraper, EngieScraper, AlpiqScraper, AlternaScraper, EkwateurScraper, OctopusScraper, VattenfallScraper
from .price_scrapers.base import OfferData

logger = logging.getLogger(__name__)


class PriceUpdateService:
    """Service to update energy provider prices from scrapers"""

    # Mapping of provider names to their scrapers
    SCRAPERS = {
        "EDF": EDFPriceScraper,
        "Enercoop": EnercoopPriceScraper,
        "TotalEnergies": TotalEnergiesPriceScraper,
        "Priméo Énergie": PrimeoEnergiePriceScraper,
        "Engie": EngieScraper,
        "ALPIQ": AlpiqScraper,
        "Alterna": AlternaScraper,
        "Ekwateur": EkwateurScraper,
        "Octopus": OctopusScraper,
        "Vattenfall": VattenfallScraper,
    }

    # Default provider info (website URLs)
    PROVIDER_DEFAULTS = {
        "EDF": {"website": "https://particulier.edf.fr"},
        "Enercoop": {"website": "https://www.enercoop.fr"},
        "TotalEnergies": {"website": "https://totalenergies.fr"},
        "Priméo Énergie": {"website": "https://www.primeo-energie.fr"},
        "Engie": {"website": "https://particuliers.engie.fr"},
        "ALPIQ": {"website": "https://particuliers.alpiq.fr"},
        "Alterna": {"website": "https://www.alterna-energie.fr"},
        "Ekwateur": {"website": "https://ekwateur.fr"},
        "Octopus": {"website": "https://octopusenergy.fr"},
        "Vattenfall": {"website": "https://www.vattenfall.fr"},
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    @classmethod
    def get_default_scraper_urls(cls, provider_name: str) -> list[str] | None:
        """Get default scraper URLs from the scraper class"""
        scraper_class = cls.SCRAPERS.get(provider_name)
        if not scraper_class:
            return None

        # Instantiate scraper with no URLs to get defaults
        scraper = scraper_class(scraper_urls=None)
        return scraper.scraper_urls if hasattr(scraper, 'scraper_urls') else None

    async def update_all_providers(self) -> Dict[str, Any]:
        """
        Update prices for all providers

        Returns:
            Dict with update results for each provider
        """
        results = {}

        for provider_name in self.SCRAPERS.keys():
            try:
                result = await self.update_provider(provider_name)
                results[provider_name] = result
            except Exception as e:
                logger.error(f"Error updating {provider_name}: {str(e)}", exc_info=True)
                results[provider_name] = {"success": False, "error": str(e)}

        return results

    async def update_provider(
        self,
        provider_name: str,
        cached_offers: List[Dict[str, Any]] | None = None
    ) -> Dict[str, Any]:
        """
        Update prices for a specific provider

        Args:
            provider_name: Name of the provider (EDF, Enercoop, TotalEnergies)
            cached_offers: Optional pre-scraped offers from preview (avoids re-scraping)

        Returns:
            Dict with update results
        """
        if provider_name not in self.SCRAPERS:
            return {"success": False, "error": f"Unknown provider: {provider_name}"}

        logger.info(f"Starting price update for {provider_name}")

        try:
            # Get or create provider
            provider = await self._get_or_create_provider(provider_name)

            # Use cached offers if provided, otherwise scrape
            if cached_offers:
                logger.info(f"Using {len(cached_offers)} cached offers for {provider_name}")
                offers = [self._offer_from_cache(offer) for offer in cached_offers]
            else:
                # Scrape prices (pass scraper_urls from database)
                scraper_class = self.SCRAPERS[provider_name]
                scraper = scraper_class(scraper_urls=provider.scraper_urls)
                offers = await scraper.scrape()

            if not offers:
                return {"success": False, "error": "No offers found", "offers_updated": 0}

            # Deactivate old offers
            await self._deactivate_old_offers(provider.id)

            # Save new offers
            created_count = 0
            updated_count = 0

            for offer_data in offers:
                is_new = await self._save_offer(provider.id, offer_data)
                if is_new:
                    created_count += 1
                else:
                    updated_count += 1

            await self.db.commit()

            logger.info(
                f"Successfully updated {provider_name}: "
                f"{created_count} created, {updated_count} updated"
            )

            return {
                "success": True,
                "provider": provider_name,
                "offers_created": created_count,
                "offers_updated": updated_count,
                "total_offers": len(offers),
                "updated_at": datetime.now(UTC).isoformat(),
            }

        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error updating {provider_name}: {str(e)}", exc_info=True)
            return {"success": False, "error": str(e)}

    def _offer_from_cache(self, offer_dict: Dict[str, Any]) -> OfferData:
        """Convert cached offer dict back to OfferData, parsing ISO date strings"""
        # Parse ISO date strings back to datetime objects
        valid_from = None
        valid_to = None

        if offer_dict.get("valid_from"):
            try:
                # Use datetime.fromisoformat() - built-in since Python 3.7
                valid_from = datetime.fromisoformat(offer_dict["valid_from"])
            except (ValueError, TypeError):
                pass

        if offer_dict.get("valid_to"):
            try:
                valid_to = datetime.fromisoformat(offer_dict["valid_to"])
            except (ValueError, TypeError):
                pass

        return OfferData(
            name=offer_dict["name"],
            offer_type=offer_dict["offer_type"],
            description=offer_dict.get("description"),
            subscription_price=offer_dict.get("subscription_price", 0.0),
            base_price=offer_dict.get("base_price"),
            hc_price=offer_dict.get("hc_price"),
            hp_price=offer_dict.get("hp_price"),
            base_price_weekend=offer_dict.get("base_price_weekend"),
            hp_price_weekend=offer_dict.get("hp_price_weekend"),
            hc_price_weekend=offer_dict.get("hc_price_weekend"),
            tempo_blue_hc=offer_dict.get("tempo_blue_hc"),
            tempo_blue_hp=offer_dict.get("tempo_blue_hp"),
            tempo_white_hc=offer_dict.get("tempo_white_hc"),
            tempo_white_hp=offer_dict.get("tempo_white_hp"),
            tempo_red_hc=offer_dict.get("tempo_red_hc"),
            tempo_red_hp=offer_dict.get("tempo_red_hp"),
            ejp_normal=offer_dict.get("ejp_normal"),
            ejp_peak=offer_dict.get("ejp_peak"),
            hc_price_winter=offer_dict.get("hc_price_winter"),
            hp_price_winter=offer_dict.get("hp_price_winter"),
            hc_price_summer=offer_dict.get("hc_price_summer"),
            hp_price_summer=offer_dict.get("hp_price_summer"),
            peak_day_price=offer_dict.get("peak_day_price"),
            hc_schedules=offer_dict.get("hc_schedules"),
            power_kva=offer_dict.get("power_kva"),
            valid_from=valid_from,
            valid_to=valid_to,
        )

    async def _get_or_create_provider(self, name: str) -> EnergyProvider:
        """Get existing provider or create new one with default values"""
        result = await self.db.execute(select(EnergyProvider).where(EnergyProvider.name == name))
        provider = result.scalar_one_or_none()

        # Get default values
        defaults = self.PROVIDER_DEFAULTS.get(name, {})
        default_urls = self.get_default_scraper_urls(name)

        if not provider:
            # Create new provider with defaults
            logger.info(f"Creating new provider: {name} with default URLs")
            provider = EnergyProvider(
                id=str(uuid.uuid4()),
                name=name,
                website=defaults.get("website"),
                scraper_urls=default_urls,
                is_active=True,
            )
            self.db.add(provider)
            await self.db.flush()
        else:
            # Update existing provider if scraper_urls is missing
            updated = False
            if not provider.scraper_urls and default_urls:
                provider.scraper_urls = default_urls
                updated = True
                logger.info(f"Updated provider {name} with default scraper URLs")
            if not provider.website and defaults.get("website"):
                provider.website = defaults.get("website")
                updated = True
            if updated:
                await self.db.flush()

        return provider

    async def _deactivate_old_offers(self, provider_id: str) -> None:
        """Mark all current offers as inactive (will be replaced by new ones)"""
        result = await self.db.execute(
            select(EnergyOffer).where(
                and_(
                    EnergyOffer.provider_id == provider_id,
                    EnergyOffer.is_active == True,  # noqa: E712
                    EnergyOffer.valid_to.is_(None),
                )
            )
        )
        old_offers = result.scalars().all()

        now = datetime.now(UTC)
        for offer in old_offers:
            offer.valid_to = now
            offer.is_active = False

        logger.info(f"Deactivated {len(old_offers)} old offers for provider {provider_id}")

    async def _save_offer(self, provider_id: str, offer_data: OfferData) -> bool:
        """
        Save or update an offer

        Args:
            provider_id: Provider ID
            offer_data: Offer data to save

        Returns:
            bool: True if new offer created, False if updated
        """
        # Check if similar offer exists
        result = await self.db.execute(
            select(EnergyOffer).where(
                and_(
                    EnergyOffer.provider_id == provider_id,
                    EnergyOffer.name == offer_data.name,
                    EnergyOffer.offer_type == offer_data.offer_type,
                    EnergyOffer.power_kva == offer_data.power_kva,
                    EnergyOffer.is_active == True,  # noqa: E712
                )
            )
        )
        existing_offer = result.scalar_one_or_none()

        if existing_offer:
            # Update existing offer
            for key, value in offer_data.to_dict().items():
                if hasattr(existing_offer, key):
                    setattr(existing_offer, key, value)
            existing_offer.updated_at = datetime.now(UTC)
            logger.debug(f"Updated offer: {offer_data.name}")
            return False
        else:
            # Create new offer
            offer = EnergyOffer(
                id=str(uuid.uuid4()),
                provider_id=provider_id,
                **offer_data.to_dict(),
            )
            self.db.add(offer)
            logger.debug(f"Created offer: {offer_data.name}")
            return True

    async def get_active_offers(self, provider_name: str | None = None) -> List[EnergyOffer]:
        """
        Get all active offers, optionally filtered by provider

        Args:
            provider_name: Optional provider name filter

        Returns:
            List of active offers
        """
        query = select(EnergyOffer).where(EnergyOffer.is_active == True)  # noqa: E712

        if provider_name:
            result = await self.db.execute(select(EnergyProvider).where(EnergyProvider.name == provider_name))
            provider = result.scalar_one_or_none()
            if provider:
                query = query.where(EnergyOffer.provider_id == provider.id)

        result = await self.db.execute(query.order_by(EnergyOffer.name))
        return list(result.scalars().all())

    async def preview_provider_update(self, provider_name: str) -> Dict[str, Any]:
        """
        Preview what would happen when updating a provider (DRY RUN - no DB changes)

        Args:
            provider_name: Name of the provider (EDF, Enercoop, TotalEnergies)

        Returns:
            Dict with preview results
        """
        if provider_name not in self.SCRAPERS:
            return {"success": False, "error": f"Unknown provider: {provider_name}"}

        logger.info(f"Starting preview for {provider_name}")

        try:
            # Get existing provider (without creating)
            result = await self.db.execute(
                select(EnergyProvider).where(EnergyProvider.name == provider_name)
            )
            provider = result.scalar_one_or_none()

            if not provider:
                # Provider doesn't exist yet
                logger.info(f"Provider {provider_name} does not exist yet")
                current_offers = []
            else:
                # Get current active offers
                current_result = await self.db.execute(
                    select(EnergyOffer).where(
                        and_(
                            EnergyOffer.provider_id == provider.id,
                            EnergyOffer.is_active == True,  # noqa: E712
                        )
                    )
                )
                current_offers = list(current_result.scalars().all())

            # Scrape new offers (WITHOUT saving)
            scraper_class = self.SCRAPERS[provider_name]
            scraper = scraper_class()
            scraped_offers = await scraper.scrape()

            if not scraped_offers:
                return {
                    "success": False,
                    "error": "No offers found from scraper",
                    "offers_to_create": [],
                    "offers_to_update": [],
                    "offers_to_deactivate": []
                }

            # Compare current offers with scraped offers
            offers_to_create = []
            offers_to_update = []
            matched_current_offers = set()

            for scraped_offer in scraped_offers:
                # Try to find matching current offer
                matching_offer = None
                for current_offer in current_offers:
                    if (
                        current_offer.name == scraped_offer.name
                        and current_offer.offer_type == scraped_offer.offer_type
                        and current_offer.power_kva == scraped_offer.power_kva
                    ):
                        matching_offer = current_offer
                        matched_current_offers.add(current_offer.id)
                        break

                if matching_offer:
                    # Check if there are differences (would be updated)
                    diff = self._get_offer_diff(matching_offer, scraped_offer)
                    if diff:
                        offers_to_update.append({
                            "id": matching_offer.id,
                            "name": matching_offer.name,
                            "offer_type": matching_offer.offer_type,
                            "power_kva": matching_offer.power_kva,
                            "current": self._offer_to_dict(matching_offer),
                            "new": scraped_offer.to_dict(for_json=True),
                            "changes": diff
                        })
                else:
                    # New offer to create
                    offers_to_create.append(scraped_offer.to_dict(for_json=True))

            # Offers to deactivate (current offers not matched)
            offers_to_deactivate = []
            for current_offer in current_offers:
                if current_offer.id not in matched_current_offers:
                    offers_to_deactivate.append({
                        "id": current_offer.id,
                        "name": current_offer.name,
                        "offer_type": current_offer.offer_type,
                        "power_kva": current_offer.power_kva,
                        "subscription_price": current_offer.subscription_price,
                        "base_price": current_offer.base_price,
                        "hc_price": current_offer.hc_price,
                        "hp_price": current_offer.hp_price,
                    })

            logger.info(
                f"Preview for {provider_name}: "
                f"{len(offers_to_create)} to create, "
                f"{len(offers_to_update)} to update, "
                f"{len(offers_to_deactivate)} to deactivate"
            )

            # Convert all scraped offers to dict for caching (JSON serializable)
            all_scraped_offers = [offer.to_dict(for_json=True) for offer in scraped_offers]

            return {
                "success": True,
                "provider": provider_name,
                "offers_to_create": offers_to_create,
                "offers_to_update": offers_to_update,
                "offers_to_deactivate": offers_to_deactivate,
                "scraped_offers": all_scraped_offers,  # All scraped offers for caching
                "used_fallback": scraper.used_fallback,
                "fallback_reason": scraper.fallback_reason,
                "summary": {
                    "total_current": len(current_offers),
                    "total_scraped": len(scraped_offers),
                    "new": len(offers_to_create),
                    "updated": len(offers_to_update),
                    "deactivated": len(offers_to_deactivate),
                }
            }

        except Exception as e:
            logger.error(f"Error previewing {provider_name}: {str(e)}", exc_info=True)
            return {"success": False, "error": str(e)}

    def _get_offer_diff(self, current_offer: EnergyOffer, scraped_offer: OfferData) -> Dict[str, Any]:
        """
        Compare current offer with scraped offer and return differences

        Args:
            current_offer: Current offer from database
            scraped_offer: Scraped offer data

        Returns:
            Dict of fields that changed {field_name: {"old": value, "new": value}}
        """
        diff = {}
        scraped_dict = scraped_offer.to_dict()

        # Fields to compare
        comparable_fields = [
            "description", "subscription_price", "base_price", "hc_price", "hp_price",
            "base_price_weekend", "hp_price_weekend", "hc_price_weekend",
            "tempo_blue_hc", "tempo_blue_hp", "tempo_white_hc", "tempo_white_hp",
            "tempo_red_hc", "tempo_red_hp", "ejp_normal", "ejp_peak",
            "hc_price_winter", "hp_price_winter", "hc_price_summer", "hp_price_summer",
            "peak_day_price", "hc_schedules"
        ]

        # Price fields that should use tolerance comparison (avoid float precision issues)
        price_fields = {
            "subscription_price", "base_price", "hc_price", "hp_price",
            "base_price_weekend", "hp_price_weekend", "hc_price_weekend",
            "tempo_blue_hc", "tempo_blue_hp", "tempo_white_hc", "tempo_white_hp",
            "tempo_red_hc", "tempo_red_hp", "ejp_normal", "ejp_peak",
            "hc_price_winter", "hp_price_winter", "hc_price_summer", "hp_price_summer",
            "peak_day_price"
        }

        # Tolerance for price comparison (0.00001 = 0.001 centime)
        PRICE_TOLERANCE = 0.00001

        for field in comparable_fields:
            current_value = getattr(current_offer, field, None)
            new_value = scraped_dict.get(field)

            # Handle None vs 0.0 comparison for numeric fields
            if (current_value is None or current_value == 0.0) and (new_value is None or new_value == 0.0):
                continue

            # For price fields, use tolerance comparison to avoid float precision issues
            if field in price_fields:
                # Convert to float for comparison
                current_float = float(current_value) if current_value is not None else 0.0
                new_float = float(new_value) if new_value is not None else 0.0

                # If difference is below tolerance, consider them equal
                if abs(current_float - new_float) < PRICE_TOLERANCE:
                    continue

                diff[field] = {
                    "old": current_float,
                    "new": new_float
                }
            else:
                # For non-price fields, use exact comparison
                if current_value != new_value:
                    diff[field] = {
                        "old": current_value,
                        "new": new_value
                    }

        return diff

    def _offer_to_dict(self, offer: EnergyOffer) -> Dict[str, Any]:
        """Convert EnergyOffer model to dict for comparison"""
        return {
            "name": offer.name,
            "offer_type": offer.offer_type,
            "description": offer.description,
            "subscription_price": offer.subscription_price,
            "base_price": offer.base_price,
            "hc_price": offer.hc_price,
            "hp_price": offer.hp_price,
            "base_price_weekend": offer.base_price_weekend,
            "hp_price_weekend": offer.hp_price_weekend,
            "hc_price_weekend": offer.hc_price_weekend,
            "tempo_blue_hc": offer.tempo_blue_hc,
            "tempo_blue_hp": offer.tempo_blue_hp,
            "tempo_white_hc": offer.tempo_white_hc,
            "tempo_white_hp": offer.tempo_white_hp,
            "tempo_red_hc": offer.tempo_red_hc,
            "tempo_red_hp": offer.tempo_red_hp,
            "ejp_normal": offer.ejp_normal,
            "ejp_peak": offer.ejp_peak,
            "hc_price_winter": offer.hc_price_winter,
            "hp_price_winter": offer.hp_price_winter,
            "hc_price_summer": offer.hc_price_summer,
            "hp_price_summer": offer.hp_price_summer,
            "peak_day_price": offer.peak_day_price,
            "hc_schedules": offer.hc_schedules,
            "power_kva": offer.power_kva,
        }

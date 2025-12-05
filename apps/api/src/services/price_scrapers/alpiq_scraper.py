"""AlpIQ price scraper - Fetches tariffs from HelloWatt comparison site"""
from typing import List
import re
import httpx
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData


class AlpiqScraper(BasePriceScraper):
    """Scraper for AlpIQ market offers via HelloWatt"""

    # HelloWatt URL for Alpiq pricing
    HELLOWATT_URL = "https://www.hellowatt.fr/fournisseurs/alpiq/electricite"

    # Standard subscription prices TTC (identical to TRV - regulated tariff)
    SUBSCRIPTIONS_BASE = {
        3: 11.73, 6: 15.47, 9: 19.39, 12: 23.32, 15: 27.06,
        18: 30.76, 24: 38.79, 30: 46.44, 36: 54.29
    }

    SUBSCRIPTIONS_HCHP = {
        6: 15.74, 9: 19.81, 12: 23.76, 15: 27.49,
        18: 31.34, 24: 39.47, 30: 47.02, 36: 54.61
    }

    # Fallback: Manual pricing data TTC (updated 2025-12-06)
    # Source: https://www.hellowatt.fr/fournisseurs/alpiq/electricite
    # Électricité Référence = -4% sur le prix du kWh HT vs TRV
    FALLBACK_PRICES = {
        "REFERENCE_BASE": 0.1888,  # €/kWh TTC
        "REFERENCE_HP": 0.2012,    # €/kWh TTC
        "REFERENCE_HC": 0.1584,    # €/kWh TTC
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("AlpIQ")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.HELLOWATT_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch AlpIQ tariffs from HelloWatt

        Returns:
            List[OfferData]: List of AlpIQ offers (Électricité Référence only)
        """
        errors = []

        try:
            url = self.scraper_urls[0] if self.scraper_urls else self.HELLOWATT_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement de la page HelloWatt (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    offers = self._parse_hellowatt(response.text)

                    if not offers:
                        error_msg = "Échec du parsing HelloWatt - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(offers)} AlpIQ offers from HelloWatt")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping HelloWatt : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if scraping failed
        if errors:
            self.logger.info(f"Using fallback data for AlpIQ due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.used_fallback = True
                self.fallback_reason = ' | '.join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} AlpIQ offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping AlpIQ (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping AlpIQ - raison inconnue")

    def _parse_hellowatt(self, html: str) -> List[OfferData]:
        """
        Parse HelloWatt HTML page for Alpiq prices

        The page contains tables with:
        - Grille Tarifaire Électricité Référence / Base
        - Grille Tarifaire Électricité Référence / Heures Creuses - Heures Pleines
        """
        offers = []

        try:
            # Extract Base price (format: 0,1888 € or similar)
            # Look for pattern in the Base tariff table
            base_match = re.search(r'Tarif\s+Base.*?(\d+[,\.]\d{4})\s*€', html, re.DOTALL | re.IGNORECASE)

            # Extract HP/HC prices
            hp_match = re.search(r'Tarif\s+HP.*?(\d+[,\.]\d{4})\s*€', html, re.DOTALL | re.IGNORECASE)
            hc_match = re.search(r'Tarif\s+HC.*?(\d+[,\.]\d{4})\s*€', html, re.DOTALL | re.IGNORECASE)

            # Alternative: look for prices in format "0,XXXX €"
            if not base_match:
                # Find all prices matching pattern like "0,1888 €"
                all_prices = re.findall(r'(\d+[,\.]\d{4})\s*€', html)
                if all_prices:
                    # Filter to reasonable kWh prices (between 0.10 and 0.30)
                    kwh_prices = []
                    for p in all_prices:
                        price = float(p.replace(',', '.'))
                        if 0.10 <= price <= 0.30:
                            kwh_prices.append(price)

                    if len(kwh_prices) >= 3:
                        # Typically: Base, HP, HC in order of appearance
                        # But we need to identify them correctly
                        unique_prices = list(dict.fromkeys(kwh_prices))  # Remove duplicates, keep order
                        self.logger.info(f"Found unique kWh prices: {unique_prices}")

                        if len(unique_prices) >= 1:
                            base_price = unique_prices[0]
                        if len(unique_prices) >= 2:
                            hp_price = unique_prices[1] if unique_prices[1] > unique_prices[0] else unique_prices[0]
                        if len(unique_prices) >= 3:
                            hc_price = min(unique_prices)  # HC is always the lowest
                            hp_price = max(unique_prices)  # HP is always the highest
                            # Base is typically between HC and HP or equal to one
                            for p in unique_prices:
                                if p not in [hc_price, hp_price]:
                                    base_price = p
                                    break
                            else:
                                base_price = unique_prices[0]

            # Convert matches to floats
            def to_float(match_or_str):
                if hasattr(match_or_str, 'group'):
                    s = match_or_str.group(1)
                else:
                    s = str(match_or_str)
                return float(s.replace(',', '.'))

            # Get prices from matches or use defaults
            if base_match:
                base_price = to_float(base_match)
            elif 'base_price' not in dir():
                base_price = self.FALLBACK_PRICES["REFERENCE_BASE"]

            if hp_match:
                hp_price = to_float(hp_match)
            elif 'hp_price' not in dir():
                hp_price = self.FALLBACK_PRICES["REFERENCE_HP"]

            if hc_match:
                hc_price = to_float(hc_match)
            elif 'hc_price' not in dir():
                hc_price = self.FALLBACK_PRICES["REFERENCE_HC"]

            self.logger.info(f"Parsed prices - Base: {base_price}, HP: {hp_price}, HC: {hc_price}")

            # Extract update date if available
            date_match = re.search(r'Mise à jour le (\d{1,2})\s+(\w+)\s+(\d{4})', html, re.IGNORECASE)
            months_fr = {
                'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
                'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
                'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
            }

            if date_match:
                day, month_str, year = date_match.groups()
                month = months_fr.get(month_str.lower(), 12)
                valid_from = datetime(int(year), month, int(day), 0, 0, 0, tzinfo=UTC)
            else:
                valid_from = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

            # Generate offers for Électricité Référence - BASE
            for power, subscription in self.SUBSCRIPTIONS_BASE.items():
                offers.append(OfferData(
                    name=f"Électricité Référence - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Option Base - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    base_price=base_price,
                    power_kva=power,
                    valid_from=valid_from,
                ))

            # Generate offers for Électricité Référence - HC/HP
            for power, subscription in self.SUBSCRIPTIONS_HCHP.items():
                offers.append(OfferData(
                    name=f"Électricité Référence - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Heures Creuses - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    hp_price=hp_price,
                    hc_price=hc_price,
                    power_kva=power,
                    valid_from=valid_from,
                ))

            self.logger.info(f"Successfully parsed {len(offers)} offers from HelloWatt")
            return offers

        except Exception as e:
            self.logger.error(f"Error parsing HelloWatt: {e}", exc_info=True)
            return []

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []
        valid_from = datetime(2025, 12, 5, 0, 0, 0, tzinfo=UTC)

        # Électricité Référence - BASE offers
        for power, subscription in self.SUBSCRIPTIONS_BASE.items():
            offers.append(
                OfferData(
                    name=f"Électricité Référence - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Option Base - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    base_price=self.FALLBACK_PRICES["REFERENCE_BASE"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité Référence - HC/HP offers
        for power, subscription in self.SUBSCRIPTIONS_HCHP.items():
            offers.append(
                OfferData(
                    name=f"Électricité Référence - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Heures Creuses - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    hp_price=self.FALLBACK_PRICES["REFERENCE_HP"],
                    hc_price=self.FALLBACK_PRICES["REFERENCE_HC"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate AlpIQ offer data"""
        if not offers:
            return False

        for offer in offers:
            if not offer.name or not offer.offer_type or offer.subscription_price <= 0:
                self.logger.error(f"Invalid offer: {offer.name}")
                return False

            if offer.offer_type == "BASE" and (not offer.base_price or offer.base_price <= 0):
                self.logger.error(f"BASE offer missing base_price: {offer.name}")
                return False

            if offer.offer_type == "HC_HP" and (not offer.hp_price or not offer.hc_price):
                self.logger.error(f"HC_HP offer missing prices: {offer.name}")
                return False

            if offer.power_kva not in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                self.logger.error(f"Invalid power: {offer.power_kva}")
                return False

        return True

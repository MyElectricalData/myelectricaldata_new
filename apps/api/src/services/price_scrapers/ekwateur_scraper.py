"""Ekwateur price scraper - Fetches tariffs from Ekwateur website"""
from typing import List
import httpx
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData


class EkwateurScraper(BasePriceScraper):
    """Scraper for Ekwateur market offers"""

    # Ekwateur pricing page URL
    PRICING_URL = "https://ekwateur.fr/prix-kwh-electricite-abonnement-ekwateur/"

    # Fallback: Manual pricing data (updated November 2025)
    # Source: https://ekwateur.fr/prix-kwh-electricite-abonnement-ekwateur/
    # Note: Ekwateur only provides pricing for 3, 6, 9 kVA on their website
    FALLBACK_PRICES = {
        "VARIABLE_BASE": {
            # Électricité verte - Prix variable - Option Base
            # Prix TTC novembre 2025
            3: {"subscription": 15.89, "kwh": 0.2000},
            6: {"subscription": 19.70, "kwh": 0.2000},
            9: {"subscription": 23.65, "kwh": 0.2018},
        },
        "VARIABLE_HC_HP": {
            # Électricité verte - Prix variable - Heures Creuses
            3: {"subscription": 15.96, "hp": 0.2189, "hc": 0.1704},
            6: {"subscription": 20.10, "hp": 0.2189, "hc": 0.1704},
            9: {"subscription": 24.28, "hp": 0.2189, "hc": 0.1704},
        },
        "FIXE_BASE": {
            # Électricité verte - Prix fixe - Option Base
            3: {"subscription": 11.73, "kwh": 0.1791},
            6: {"subscription": 19.70, "kwh": 0.1791},
            9: {"subscription": 23.65, "kwh": 0.2015},
        },
        "FIXE_HC_HP": {
            # Électricité verte - Prix fixe - Heures Creuses
            3: {"subscription": 15.08, "hp": 0.2257, "hc": 0.1770},
            6: {"subscription": 15.74, "hp": 0.2257, "hc": 0.1770},
            9: {"subscription": 24.28, "hp": 0.2257, "hc": 0.1770},
        },
        "VE_BASE": {
            # Électricité verte - Spéciale véhicule électrique - Option Base
            3: {"subscription": 15.89, "kwh": 0.1929},
            6: {"subscription": 19.70, "kwh": 0.1929},
            9: {"subscription": 23.65, "kwh": 0.2015},
        },
        "VE_HC_HP": {
            # Électricité verte - Spéciale véhicule électrique - Heures Creuses
            3: {"subscription": 15.96, "hp": 0.2257, "hc": 0.1347},
            6: {"subscription": 20.10, "hp": 0.2257, "hc": 0.1347},
            9: {"subscription": 24.28, "hp": 0.2257, "hc": 0.1347},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Ekwateur")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.PRICING_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Ekwateur tariffs - Scrape website, fallback to manual data if needed

        Returns:
            List[OfferData]: List of Ekwateur offers
        """
        errors = []

        # Try to scrape from website
        try:
            url = self.scraper_urls[0] if self.scraper_urls else self.PRICING_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement de la page Ekwateur (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Parse HTML
                    html = response.text
                    offers = self._parse_html(html)

                    if not offers:
                        error_msg = "Échec du parsing de la page Ekwateur - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(offers)} Ekwateur offers from website")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping du site Ekwateur : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if scraping failed
        self.logger.info(f"Using fallback data for Ekwateur due to errors: {' | '.join(errors)}")
        fallback_offers = self._get_fallback_offers()
        if fallback_offers:
            self.logger.info(f"Successfully loaded {len(fallback_offers)} Ekwateur offers from fallback data")
            return fallback_offers
        else:
            raise Exception(f"Échec complet du scraping Ekwateur (y compris fallback) : {' | '.join(errors)}")

    def _parse_html(self, html: str) -> List[OfferData]:
        """Parse HTML from Ekwateur pricing page"""
        # For now, return empty list to use fallback
        # HTML parsing can be implemented later with BeautifulSoup or regex
        return []

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []

        # Date: November 2025
        valid_from = datetime(2025, 11, 1, 0, 0, 0, 0, tzinfo=UTC)

        # Électricité verte - Prix variable - BASE
        for power, prices in self.FALLBACK_PRICES["VARIABLE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte - Prix variable - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre d'électricité 100% verte à prix variable indexé sur le marché - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte - Prix variable - HC/HP
        for power, prices in self.FALLBACK_PRICES["VARIABLE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte - Prix variable - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre d'électricité 100% verte à prix variable indexé sur le marché - Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte - Prix fixe - BASE
        for power, prices in self.FALLBACK_PRICES["FIXE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte - Prix fixe - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre d'électricité 100% verte à prix fixe pendant 1 an - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte - Prix fixe - HC/HP
        for power, prices in self.FALLBACK_PRICES["FIXE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte - Prix fixe - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre d'électricité 100% verte à prix fixe pendant 1 an - Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte - Spéciale VE - BASE
        for power, prices in self.FALLBACK_PRICES["VE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte - Spéciale VE - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre d'électricité 100% verte spéciale véhicule électrique - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte - Spéciale VE - HC/HP
        for power, prices in self.FALLBACK_PRICES["VE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte - Spéciale VE - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre d'électricité 100% verte spéciale véhicule électrique - Heures Creuses - {power} kVA - HC renforcées",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate Ekwateur offer data"""
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

            if offer.power_kva not in [3, 6, 9]:
                self.logger.error(f"Invalid power for Ekwateur (only 3/6/9 kVA supported): {offer.power_kva}")
                return False

        return True

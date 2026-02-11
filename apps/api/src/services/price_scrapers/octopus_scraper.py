"""Octopus Energy price scraper - Fetches tariffs from HelloWatt comparison pages"""
import re
from typing import List
import httpx
from datetime import datetime, UTC
from bs4 import BeautifulSoup

from .base import BasePriceScraper, OfferData


class OctopusScraper(BasePriceScraper):
    """Scraper for Octopus Energy France market offers via HelloWatt"""

    # HelloWatt comparison pages for Octopus offers
    ECO_CONSO_URL = "https://www.hellowatt.fr/fournisseurs/octopus-energy/eco-conso"
    ECO_SAISON_URL = "https://www.hellowatt.fr/fournisseurs/octopus-energy/eco-saison"

    # Standard power levels in France (kVA)
    POWER_LEVELS = [3, 6, 9, 12, 15, 18, 24, 30, 36]

    # Fallback: Manual pricing data (updated December 2025)
    # Source: https://www.hellowatt.fr/fournisseurs/octopus-energy/eco-conso
    # Offre Octopus Eco-conso Fixe - Mise à jour 1er décembre 2025
    FALLBACK_PRICES = {
        "ECO_CONSO_BASE": {
            # Offre Octopus Eco-conso - Option Base
            # Prix TTC décembre 2025
            3: {"subscription": 11.73, "kwh": 0.1889},
            6: {"subscription": 15.47, "kwh": 0.1889},
            9: {"subscription": 19.39, "kwh": 0.1889},
            12: {"subscription": 23.32, "kwh": 0.1889},
            15: {"subscription": 27.06, "kwh": 0.1889},
            18: {"subscription": 30.76, "kwh": 0.1889},
            24: {"subscription": 38.79, "kwh": 0.1889},
            30: {"subscription": 46.44, "kwh": 0.1889},
            36: {"subscription": 55.05, "kwh": 0.1889},
        },
        "ECO_CONSO_HC_HP": {
            # Offre Octopus Eco-conso - Option Heures Creuses
            # Note: pas de 3 kVA en HC/HP
            6: {"subscription": 15.74, "hp": 0.2012, "hc": 0.1584},
            9: {"subscription": 20.21, "hp": 0.2012, "hc": 0.1584},
            12: {"subscription": 24.28, "hp": 0.2012, "hc": 0.1584},
            15: {"subscription": 28.15, "hp": 0.2012, "hc": 0.1584},
            18: {"subscription": 32.13, "hp": 0.2012, "hc": 0.1584},
            24: {"subscription": 40.53, "hp": 0.2012, "hc": 0.1584},
            30: {"subscription": 48.34, "hp": 0.2012, "hc": 0.1584},
            36: {"subscription": 54.61, "hp": 0.2012, "hc": 0.1584},
        },
        # Source: https://www.hellowatt.fr/fournisseurs/octopus-energy/eco-saison
        # Offre Octopus Eco-saison - Prix saisonniers (20% moins cher avril-octobre)
        "ECO_SAISON_BASE": {
            # Offre Octopus Eco-saison - Option Base
            3: {"subscription": 9.89, "kwh": 0.1981},
            6: {"subscription": 13.19, "kwh": 0.1981},
            9: {"subscription": 16.74, "kwh": 0.1981},
            12: {"subscription": 20.33, "kwh": 0.1981},
            15: {"subscription": 23.68, "kwh": 0.1981},
            18: {"subscription": 26.87, "kwh": 0.1981},
            24: {"subscription": 34.15, "kwh": 0.1981},
            30: {"subscription": 41.47, "kwh": 0.1981},
            36: {"subscription": 48.70, "kwh": 0.1981},
        },
        "ECO_SAISON_HC_HP": {
            # Offre Octopus Eco-saison - Option Heures Creuses
            # Note: pas de 3 kVA en HC/HP
            6: {"subscription": 13.51, "hp": 0.2108, "hc": 0.1668},
            9: {"subscription": 17.48, "hp": 0.2108, "hc": 0.1668},
            12: {"subscription": 21.16, "hp": 0.2108, "hc": 0.1668},
            15: {"subscription": 24.63, "hp": 0.2108, "hc": 0.1668},
            18: {"subscription": 28.21, "hp": 0.2108, "hc": 0.1668},
            24: {"subscription": 35.70, "hp": 0.2108, "hc": 0.1668},
            30: {"subscription": 42.48, "hp": 0.2108, "hc": 0.1668},
            36: {"subscription": 48.19, "hp": 0.2108, "hc": 0.1668},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Octopus")
        # Use URLs from database if provided, otherwise use HelloWatt defaults
        self.scraper_urls = scraper_urls or [self.ECO_CONSO_URL, self.ECO_SAISON_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Octopus Energy tariffs from HelloWatt comparison pages.
        Scrapes both Eco-conso and Eco-saison offers.

        Returns:
            List[OfferData]: List of Octopus offers
        """
        errors = []
        all_offers = []

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        }

        # Try to scrape from HelloWatt pages
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for url in self.scraper_urls:
                try:
                    response = await client.get(url, headers=headers)
                    if response.status_code != 200:
                        error_msg = f"Échec du téléchargement de {url} (HTTP {response.status_code})"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                        continue

                    # Determine offer type from URL
                    if "eco-conso" in url:
                        offer_prefix = "Eco-conso"
                    elif "eco-saison" in url:
                        offer_prefix = "Eco-saison"
                    else:
                        offer_prefix = "Octopus"

                    # Parse HTML
                    html = response.text
                    offers = self._parse_hellowatt_html(html, offer_prefix)

                    if offers:
                        # Set offer_url for each offer
                        for offer in offers:
                            offer.offer_url = url
                        self.logger.info(f"Scraped {len(offers)} offers from {url}")
                        all_offers.extend(offers)
                    else:
                        error_msg = f"Aucune offre extraite de {url}"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)

                except Exception as e:
                    error_msg = f"Erreur lors du scraping de {url}: {str(e)}"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)

        # If we got offers from scraping, return them
        if all_offers:
            self.logger.info(f"Successfully scraped {len(all_offers)} Octopus offers total")
            return all_offers

        # Use fallback data if scraping failed
        self.logger.info(f"Using fallback data for Octopus due to errors: {' | '.join(errors)}")
        fallback_offers = self._get_fallback_offers()
        if fallback_offers:
            self.used_fallback = True
            self.fallback_reason = ' | '.join(errors)
            self.logger.info(f"Successfully loaded {len(fallback_offers)} Octopus offers from fallback data")
            return fallback_offers
        else:
            raise Exception(f"Échec complet du scraping Octopus (y compris fallback) : {' | '.join(errors)}")

    def _parse_hellowatt_html(self, html: str, offer_prefix: str) -> List[OfferData]:
        """
        Parse HTML from HelloWatt comparison pages.

        HelloWatt tables have this structure:
        - Table 1 (BASE): Puissance | Abonnement | Tarif Base
        - Table 2 (HC/HP): Puissance | Abonnement | Tarif HP | Tarif HC

        Args:
            html: The HTML content to parse
            offer_prefix: Prefix for offer names (e.g., "Eco-conso", "Eco-saison")

        Returns:
            List of OfferData objects
        """
        offers = []
        soup = BeautifulSoup(html, "html.parser")

        # Current date for valid_from
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Try to find pricing tables
        tables = soup.find_all("table")
        if not tables:
            self.logger.warning(f"No tables found on HelloWatt page for {offer_prefix}")
            return []

        # Data structures for extracted prices
        base_data = {}  # {power: {"subscription": X, "kwh": Y}}
        hchp_data = {}  # {power: {"subscription": X, "hp": Y, "hc": Z}}

        for table in tables:
            # Get header row to determine table type
            header_text = table.get_text().lower()

            # Determine if this is BASE or HC/HP table from headers
            is_hchp = "tarif hp" in header_text or "heures pleines" in header_text
            is_base = "tarif base" in header_text and not is_hchp

            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue

                # First cell should contain power level (just a number like "6", "9", etc.)
                first_cell = cells[0].get_text().strip()
                power_match = re.match(r"^(\d+)$", first_cell)
                if not power_match:
                    continue

                power = int(power_match.group(1))
                if power not in self.POWER_LEVELS:
                    continue

                # Extract numeric values from remaining cells
                values = []
                for cell in cells[1:]:  # Skip first cell (power)
                    cell_text = cell.get_text().strip()
                    # Clean: replace comma with dot, remove € and non-breaking spaces
                    cell_text = cell_text.replace(",", ".").replace("€", "").replace("\xa0", "").strip()
                    price_match = re.search(r"(\d+\.?\d*)", cell_text)
                    if price_match:
                        try:
                            val = float(price_match.group(1))
                            values.append(val)
                        except ValueError:
                            pass

                # Classify values: subscription (5-100€) vs kWh prices (0.05-0.50€)
                subscription = None
                kwh_prices = []

                for val in values:
                    if 5 <= val <= 100:
                        subscription = val
                    elif 0.05 <= val <= 0.50:
                        kwh_prices.append(val)

                # Store extracted data
                if is_base and subscription and kwh_prices:
                    base_data[power] = {
                        "subscription": subscription,
                        "kwh": kwh_prices[0]
                    }
                elif is_hchp and subscription and len(kwh_prices) >= 2:
                    # HP comes before HC in HelloWatt tables
                    hchp_data[power] = {
                        "subscription": subscription,
                        "hp": kwh_prices[0],  # First price is HP
                        "hc": kwh_prices[1]   # Second price is HC
                    }

        self.logger.debug(f"Extracted BASE data for {len(base_data)} power levels")
        self.logger.debug(f"Extracted HC/HP data for {len(hchp_data)} power levels")

        # Generate BASE offers
        for power, data in sorted(base_data.items()):
            offers.append(
                OfferData(
                    name=f"Octopus {offer_prefix}",
                    offer_type="BASE",
                    description=f"Offre Octopus {offer_prefix} - Option Base - {power} kVA",
                    subscription_price=data["subscription"],
                    base_price=data["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Generate HC/HP offers
        for power, data in sorted(hchp_data.items()):
            offers.append(
                OfferData(
                    name=f"Octopus {offer_prefix}",
                    offer_type="HC_HP",
                    description=f"Offre Octopus {offer_prefix} - Option Heures Creuses - {power} kVA",
                    subscription_price=data["subscription"],
                    hp_price=data["hp"],
                    hc_price=data["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        self.logger.info(f"Parsed {len(offers)} offers from HelloWatt for {offer_prefix}")
        return offers

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data (December 2025)"""
        offers = []

        # Date: December 2025
        valid_from = datetime(2025, 12, 1, 0, 0, 0, 0, tzinfo=UTC)

        # Octopus Eco-conso - BASE
        for power, prices in self.FALLBACK_PRICES["ECO_CONSO_BASE"].items():
            offers.append(
                OfferData(
                    name="Octopus Eco-conso",
                    offer_type="BASE",
                    description=f"Offre Octopus Eco-conso Fixe - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Octopus Eco-conso - HC/HP
        for power, prices in self.FALLBACK_PRICES["ECO_CONSO_HC_HP"].items():
            offers.append(
                OfferData(
                    name="Octopus Eco-conso",
                    offer_type="HC_HP",
                    description=f"Offre Octopus Eco-conso Fixe - Option Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Octopus Eco-saison - BASE
        for power, prices in self.FALLBACK_PRICES["ECO_SAISON_BASE"].items():
            offers.append(
                OfferData(
                    name="Octopus Eco-saison",
                    offer_type="BASE",
                    description=f"Offre Octopus Eco-saison - Option Base - {power} kVA (20% moins cher avril-octobre)",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Octopus Eco-saison - HC/HP
        for power, prices in self.FALLBACK_PRICES["ECO_SAISON_HC_HP"].items():
            offers.append(
                OfferData(
                    name="Octopus Eco-saison",
                    offer_type="HC_HP",
                    description=f"Offre Octopus Eco-saison - Option Heures Creuses - {power} kVA (20% moins cher avril-octobre)",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate Octopus offer data"""
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

            if offer.power_kva not in self.POWER_LEVELS:
                self.logger.error(f"Invalid power level: {offer.power_kva}")
                return False

        return True

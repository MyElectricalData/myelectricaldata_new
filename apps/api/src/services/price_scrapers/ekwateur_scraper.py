"""Ekwateur price scraper - Fetches tariffs from Ekwateur website"""
import re
from typing import List
import httpx
from datetime import datetime, UTC
from bs4 import BeautifulSoup

from .base import BasePriceScraper, OfferData


class EkwateurScraper(BasePriceScraper):
    """Scraper for Ekwateur market offers"""

    # Ekwateur pricing page URL
    PRICING_URL = "https://ekwateur.fr/prix-kwh-electricite-abonnement-ekwateur/"

    # Fallback: Manual pricing data (updated December 2025)
    # Source: https://ekwateur.fr/prix-kwh-electricite-abonnement-ekwateur/
    # Note: Ekwateur only provides pricing for 3, 6, 9 kVA on their website
    FALLBACK_PRICES = {
        "FIXE_BASE": {
            # Électricité verte - Prix fixe - Option Base
            # Prix TTC décembre 2025
            3: {"subscription": 11.78, "kwh": 0.1606},
            6: {"subscription": 15.57, "kwh": 0.1606},
            9: {"subscription": 19.655, "kwh": 0.1606},
        },
        "FIXE_HC_HP": {
            # Électricité verte - Prix fixe - Heures Creuses
            3: {"subscription": 15.13, "hp": 0.17914, "hc": 0.14026},
            6: {"subscription": 15.84, "hp": 0.17914, "hc": 0.1426},
            9: {"subscription": 20.48, "hp": 0.17914, "hc": 0.1426},
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
            self.used_fallback = True
            self.fallback_reason = ' | '.join(errors)
            self.logger.info(f"Successfully loaded {len(fallback_offers)} Ekwateur offers from fallback data")
            return fallback_offers
        else:
            raise Exception(f"Échec complet du scraping Ekwateur (y compris fallback) : {' | '.join(errors)}")

    def _parse_html(self, html: str) -> List[OfferData]:
        """
        Parse HTML from Ekwateur pricing page.

        The page contains 2 tables:
        - Table 1: kWh prices (Base, HP, HC) per power level (3, 6, 9 kVA)
        - Table 2: Subscription prices per power level
        """
        offers = []
        soup = BeautifulSoup(html, "html.parser")

        # Find all pricing tables
        tables = soup.find_all("table")
        if len(tables) < 2:
            self.logger.warning(f"Expected at least 2 tables, found {len(tables)}")
            return []

        # Parse pricing data from tables
        kwh_data = self._parse_kwh_table(tables)
        subscription_data = self._parse_subscription_table(tables)

        if not kwh_data or not subscription_data:
            self.logger.warning("Failed to parse pricing tables")
            return []

        # Current date for valid_from
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Generate offers: Prix fixe BASE
        for power in [3, 6, 9]:
            base_key = f"base_{power}"
            if base_key in kwh_data and base_key in subscription_data:
                offers.append(
                    OfferData(
                        name=f"Électricité verte - Prix fixe - Base {power} kVA",
                        offer_type="BASE",
                        description=f"Offre d'électricité 100% verte à prix fixe - Option Base - {power} kVA",
                        subscription_price=subscription_data[base_key],
                        base_price=kwh_data[base_key],
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

        # Generate offers: Prix fixe HC/HP
        for power in [3, 6, 9]:
            hp_key = f"hp_{power}"
            hc_key = f"hc_{power}"
            sub_key = f"hchp_{power}"
            if hp_key in kwh_data and hc_key in kwh_data and sub_key in subscription_data:
                offers.append(
                    OfferData(
                        name=f"Électricité verte - Prix fixe - Heures Creuses {power} kVA",
                        offer_type="HC_HP",
                        description=f"Offre d'électricité 100% verte à prix fixe - Heures Creuses - {power} kVA",
                        subscription_price=subscription_data[sub_key],
                        hp_price=kwh_data[hp_key],
                        hc_price=kwh_data[hc_key],
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

        self.logger.info(f"Parsed {len(offers)} offers from HTML")
        return offers

    def _parse_kwh_table(self, tables: list) -> dict:
        """
        Parse kWh prices from the first table (kWh prices).

        Table structure:
        - Headers: Offre | Base (3,6,9 kVA) | Heures pleines (3,6,9 kVA) | Heures creuses (3,6,9 kVA)
        - Data row: "Électricité vertePrix fixe" | 9 prices

        Returns dict with keys like 'base_3', 'hp_6', 'hc_9'
        """
        data = {}

        # First table contains kWh prices (has "heures creuses" in header)
        for table in tables:
            text = table.get_text().lower()
            if "heures creuses" not in text:
                continue

            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue

                row_text = row.get_text().lower()

                # Look for the data row with prices (contains "prix fixe" or "électricité")
                if "prix fixe" in row_text or "électricité" in row_text:
                    # Extract all prices from cells
                    prices = []
                    for cell in cells:
                        cell_text = cell.get_text().strip().replace(",", ".").replace("€", "")
                        # Match price patterns like "0.1606"
                        price_match = re.search(r"(\d+\.\d+)", cell_text)
                        if price_match:
                            try:
                                price = float(price_match.group(1))
                                # kWh prices are typically between 0.10 and 0.50
                                if 0.05 < price < 0.60:
                                    prices.append(price)
                            except ValueError:
                                pass

                    # If we found 9 prices: Base(3,6,9), HP(3,6,9), HC(3,6,9)
                    if len(prices) >= 9:
                        data["base_3"] = prices[0]
                        data["base_6"] = prices[1]
                        data["base_9"] = prices[2]
                        data["hp_3"] = prices[3]
                        data["hp_6"] = prices[4]
                        data["hp_9"] = prices[5]
                        data["hc_3"] = prices[6]
                        data["hc_6"] = prices[7]
                        data["hc_9"] = prices[8]
                        self.logger.info(f"Parsed kWh prices: {data}")
                        return data

        return data

    def _parse_subscription_table(self, tables: list) -> dict:
        """
        Parse subscription prices from the second table.

        Table structure:
        - Headers: Offre | Base (3,6,9 kVA) | Heures pleines/Heures creuses (3,6,9 kVA)
        - Data row: "Électricité vertePrix fixe" | 6 prices

        Returns dict with keys like 'base_3', 'hchp_6'
        """
        data = {}

        # Second table contains subscription prices (has "heures pleines / heures creuses" combined)
        for table in tables:
            text = table.get_text().lower()
            # This table has combined "heures pleines / heures creuses" header, not separate
            if "heures creuses" in text and "heures pleines" in text:
                # Check if it's the subscription table (no 9-column kWh prices)
                # by looking for the combined header pattern
                header_text = table.find("thead").get_text().lower() if table.find("thead") else text
                if "heures pleines / heures creuses" in header_text or text.count("kva") == 6:
                    pass  # This is the subscription table
                else:
                    continue

            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all(["td", "th"])
                if len(cells) < 2:
                    continue

                row_text = row.get_text().lower()

                # Look for the data row with prices
                if "prix fixe" in row_text or "électricité" in row_text:
                    prices = []
                    for cell in cells:
                        cell_text = cell.get_text().strip().replace(",", ".").replace("€", "")
                        # Match price patterns like "15.57"
                        price_match = re.search(r"(\d+\.\d+)", cell_text)
                        if price_match:
                            try:
                                price = float(price_match.group(1))
                                # Subscription prices are typically between 5 and 50 €/month
                                if 5.0 < price < 60.0:
                                    prices.append(price)
                            except ValueError:
                                pass

                    # If we found 6 prices: Base(3,6,9), HC/HP(3,6,9)
                    if len(prices) >= 6:
                        data["base_3"] = prices[0]
                        data["base_6"] = prices[1]
                        data["base_9"] = prices[2]
                        data["hchp_3"] = prices[3]
                        data["hchp_6"] = prices[4]
                        data["hchp_9"] = prices[5]
                        self.logger.info(f"Parsed subscription prices: {data}")
                        return data

        return data

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data (December 2025)"""
        offers = []

        # Date: December 2025
        valid_from = datetime(2025, 12, 1, 0, 0, 0, 0, tzinfo=UTC)

        # Électricité verte - Prix fixe - BASE
        for power, prices in self.FALLBACK_PRICES["FIXE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte - Prix fixe - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre d'électricité 100% verte à prix fixe - Option Base - {power} kVA",
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
                    description=f"Offre d'électricité 100% verte à prix fixe - Heures Creuses - {power} kVA",
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

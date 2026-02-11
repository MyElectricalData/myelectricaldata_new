"""Engie price scraper - Fetches tariffs from HelloWatt comparison site"""
import re
from typing import List, Any
import httpx
from datetime import datetime, UTC
from bs4 import BeautifulSoup

from .base import BasePriceScraper, OfferData


class EngieScraper(BasePriceScraper):
    """Scraper for Engie market offers via HelloWatt"""

    # HelloWatt pricing page URL for Engie
    HELLOWATT_URL = "https://www.hellowatt.fr/fournisseurs/engie/tarif-prix-kwh-engie"

    # Fallback: Manual pricing data (updated December 2025)
    # Source: https://www.hellowatt.fr/fournisseurs/engie/tarif-prix-kwh-engie
    FALLBACK_PRICES = {
        "REFERENCE_3ANS_BASE": {
            # Elec Référence 3 ans - Option Base
            # Abonnement TTC + Prix kWh TTC
            3: {"subscription": 11.48, "kwh": 0.2124},
            6: {"subscription": 14.97, "kwh": 0.2124},
            9: {"subscription": 18.95, "kwh": 0.2109},
            12: {"subscription": 22.47, "kwh": 0.2109},
            15: {"subscription": 25.54, "kwh": 0.2109},
            18: {"subscription": 28.51, "kwh": 0.2109},
            24: {"subscription": 35.54, "kwh": 0.2109},
            30: {"subscription": 42.19, "kwh": 0.2109},
            36: {"subscription": 51.32, "kwh": 0.2109},
        },
        "REFERENCE_3ANS_HC_HP": {
            # Elec Référence 3 ans - Heures Creuses
            # Abonnement TTC + Prix HP/HC TTC
            6: {"subscription": 15.57, "hp": 0.2184, "hc": 0.1742},
            9: {"subscription": 19.88, "hp": 0.2169, "hc": 0.1727},
            12: {"subscription": 23.64, "hp": 0.2169, "hc": 0.1727},
            15: {"subscription": 27.08, "hp": 0.2169, "hc": 0.1727},
            18: {"subscription": 30.26, "hp": 0.2169, "hc": 0.1727},
            24: {"subscription": 37.86, "hp": 0.2169, "hc": 0.1727},
            30: {"subscription": 45.06, "hp": 0.2169, "hc": 0.1727},
            36: {"subscription": 54.91, "hp": 0.2169, "hc": 0.1727},
        },
        "TRANQUILLITE_BASE": {
            # Elec Tranquillité - Option Base
            3: {"subscription": 9.75, "kwh": 0.2612},
            6: {"subscription": 12.80, "kwh": 0.2612},
            9: {"subscription": 16.30, "kwh": 0.2597},
            12: {"subscription": 19.34, "kwh": 0.2597},
            15: {"subscription": 21.99, "kwh": 0.2597},
            18: {"subscription": 24.55, "kwh": 0.2597},
            24: {"subscription": 30.60, "kwh": 0.2597},
            30: {"subscription": 36.30, "kwh": 0.2597},
            36: {"subscription": 45.18, "kwh": 0.2597},
        },
        "TRANQUILLITE_HC_HP": {
            # Elec Tranquillité - Heures Creuses
            6: {"subscription": 13.32, "hp": 0.2803, "hc": 0.2144},
            9: {"subscription": 17.10, "hp": 0.2788, "hc": 0.2129},
            12: {"subscription": 20.35, "hp": 0.2788, "hc": 0.2129},
            15: {"subscription": 23.33, "hp": 0.2788, "hc": 0.2129},
            18: {"subscription": 26.06, "hp": 0.2788, "hc": 0.2129},
            24: {"subscription": 32.61, "hp": 0.2788, "hc": 0.2129},
            30: {"subscription": 38.81, "hp": 0.2788, "hc": 0.2129},
            36: {"subscription": 47.29, "hp": 0.2788, "hc": 0.2129},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Engie")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.HELLOWATT_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Engie tariffs from HelloWatt comparison site

        Returns:
            List[OfferData]: List of Engie offers
        """
        errors = []

        try:
            url = self.scraper_urls[0] if self.scraper_urls else self.HELLOWATT_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement de la page HelloWatt Engie (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    html = response.text
                    offers = self._parse_html(html)

                    if not offers:
                        error_msg = "Échec du parsing de la page HelloWatt Engie - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        # Set offer_url for each offer
                        for offer in offers:
                            offer.offer_url = url
                        self.logger.info(f"Successfully scraped {len(offers)} Engie offers from HelloWatt")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping HelloWatt Engie : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if scraping failed
        if errors:
            self.logger.info(f"Using fallback data for Engie due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.used_fallback = True
                self.fallback_reason = ' | '.join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Engie offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Engie (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping Engie - raison inconnue")

    def _parse_html(self, html: str) -> List[OfferData]:
        """
        Parse HTML from HelloWatt Engie pricing page.

        HelloWatt uses h3 headers like "Grille Tarifaire Elec Référence 3 ans / Base"
        followed by tables with pricing data.
        """
        offers = []
        soup = BeautifulSoup(html, "html.parser")

        # Extract update date from page
        valid_from = self._extract_update_date(soup)
        self.logger.info(f"Extracted valid_from date: {valid_from}")

        # Find all h3 headers that contain "Grille Tarifaire" for electricity offers
        headers = soup.find_all(['h2', 'h3', 'h4'])
        self.logger.info(f"Found {len(headers)} headers on page")

        for header in headers:
            header_text = header.get_text().strip().lower()

            # Skip non-electricity offers (gas, dual)
            if 'gaz' in header_text or 'duo' in header_text:
                continue

            # Look for electricity pricing tables
            if 'grille tarifaire' not in header_text and 'elec' not in header_text:
                continue

            # Identify offer name and type from header
            offer_name, offer_type = self._parse_header(header_text)

            if not offer_name or not offer_type:
                self.logger.debug(f"Could not identify offer from header: {header_text}")
                continue

            self.logger.info(f"Found header for {offer_name} ({offer_type}): {header_text}")

            # Find the next table after this header
            table = self._find_next_table(header)
            if not table:
                self.logger.debug(f"No table found after header: {header_text}")
                continue

            # Parse the table
            pricing_data = self._parse_pricing_table(table, offer_type)
            self.logger.info(f"Parsed {len(pricing_data)} power levels from table")

            # Create offers from parsed data
            for power, prices in pricing_data.items():
                offer = self._create_offer(offer_name, offer_type, power, prices, valid_from)
                if offer:
                    offers.append(offer)

        self.logger.info(f"Total parsed: {len(offers)} offers from HelloWatt HTML")
        return offers

    def _parse_header(self, header_text: str) -> tuple[str | None, str | None]:
        """
        Parse a header text to extract offer name and type.

        Examples:
        - "Grille Tarifaire Elec Référence 3 ans / Base" -> ("Elec Référence 3 ans", "BASE")
        - "Grille Tarifaire Elec Tranquillité / Heures Creuses" -> ("Elec Tranquillité", "HC_HP")
        - "Grille Tarifaire Elec Référence 3 ans / Heures Creuses - Heures Pleines" -> ("Elec Référence 3 ans", "HC_HP")
        """
        offer_name = None
        offer_type = None

        # Normalize text
        text = header_text.lower()

        # Determine offer type - check HC/HP patterns first (more specific)
        # Pattern: "Heures Creuses - Heures Pleines" or "Heures Creuses" or "HC" or "HP"
        if 'heures creuses' in text or 'heures pleines' in text:
            offer_type = "HC_HP"
        elif '/ hc' in text or '/ hp' in text:
            offer_type = "HC_HP"
        elif 'hc/hp' in text or 'hp/hc' in text:
            offer_type = "HC_HP"
        elif '/ base' in text:
            offer_type = "BASE"
        elif 'base' in text and 'heures' not in text:
            offer_type = "BASE"

        # Determine offer name
        if 'référence 3 ans' in text or 'reference 3 ans' in text:
            offer_name = "Elec Référence 3 ans"
        elif 'référence 1 an' in text or 'reference 1 an' in text:
            offer_name = "Elec Référence 1 an"
        elif 'tranquillité' in text or 'tranquillite' in text:
            offer_name = "Elec Tranquillité"
        elif "elec' car" in text or 'elec car' in text:
            offer_name = "Elec' Car"
            # Elec' Car is always HC/HP type
            offer_type = "HC_HP"

        return offer_name, offer_type

    def _find_next_table(self, header: Any) -> "BeautifulSoup | None":
        """Find the next table element after a header"""
        # Try to find table in next siblings
        for sibling in header.next_siblings:
            if hasattr(sibling, 'name'):
                if sibling.name == 'table':
                    return sibling  # type: ignore
                # If we hit another header, stop looking
                if sibling.name in ['h2', 'h3', 'h4']:
                    break
                # Look for table inside divs or other containers
                if sibling.name in ['div', 'section', 'article']:
                    table = sibling.find('table')
                    if table:
                        return table  # type: ignore

        # Try parent's next siblings
        parent = header.parent
        if parent:
            for sibling in parent.next_siblings:
                if hasattr(sibling, 'name'):
                    if sibling.name == 'table':
                        return sibling  # type: ignore
                    if sibling.name in ['div', 'section', 'article']:
                        table = sibling.find('table')
                        if table:
                            return table  # type: ignore
                    # Stop if we hit another header-like element
                    if sibling.name in ['h2', 'h3', 'h4']:
                        break

        return None

    def _extract_update_date(self, soup: BeautifulSoup) -> datetime:
        """Extract the update date from the page"""
        # Look for "Mise à jour le X MONTH YEAR" pattern
        text = soup.get_text()
        date_match = re.search(r'Mise\s+à\s+jour\s+le\s+(\d+)\s+(\w+)\s+(\d{4})', text, re.IGNORECASE)

        if date_match:
            day_str, month_str, year_str = date_match.groups()
            months_fr = {
                'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
                'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
                'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
            }
            month = months_fr.get(month_str.lower(), 12)
            try:
                return datetime(int(year_str), month, int(day_str), 0, 0, 0, tzinfo=UTC)
            except ValueError:
                pass

        # Default to current month
        return datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def _parse_pricing_table(self, table: Any, offer_type: str | None) -> dict:
        """
        Parse a pricing table and extract subscription and kWh prices per power level.

        Returns:
            dict: {power_kva: {subscription: float, kwh: float} or {subscription: float, hp: float, hc: float}}
        """
        pricing_data = {}
        rows = table.find_all("tr")

        if not rows:
            return {}

        # Determine column indices from header
        header_row = rows[0]
        headers = [cell.get_text().strip().lower() for cell in header_row.find_all(['th', 'td'])]

        self.logger.debug(f"Table headers: {headers}")

        # Find column indices
        power_idx = None
        sub_idx = None
        base_idx = None
        hp_idx = None
        hc_idx = None

        for idx, header in enumerate(headers):
            header_lower = header.lower()
            if 'puissance' in header_lower or 'kva' in header_lower:
                power_idx = idx
            elif 'abonnement' in header_lower:
                sub_idx = idx
            elif 'tarif base' in header_lower or ('base' in header_lower and 'tarif' in header_lower):
                base_idx = idx
            elif 'tarif' in header_lower and 'base' not in header_lower and hp_idx is None:
                # Generic tarif column - use as base for BASE type
                if offer_type == "BASE":
                    base_idx = idx
            elif 'hp' in header_lower or 'heures pleines' in header_lower or 'tarif hp' in header_lower:
                hp_idx = idx
            elif 'hc' in header_lower or 'heures creuses' in header_lower or 'tarif hc' in header_lower:
                hc_idx = idx

        # Default column positions if not found
        if power_idx is None:
            power_idx = 0
        if sub_idx is None and len(headers) > 1:
            sub_idx = 1

        # For BASE type, try to find base price column
        if offer_type == "BASE" and base_idx is None:
            # Usually the last column is the price
            if len(headers) > 2:
                base_idx = len(headers) - 1

        self.logger.debug(f"Column indices - power: {power_idx}, sub: {sub_idx}, base: {base_idx}, hp: {hp_idx}, hc: {hc_idx}")

        # Parse data rows
        for row in rows[1:]:  # Skip header
            cells = row.find_all(['td', 'th'])
            if len(cells) < 2:
                continue

            # Extract power (kVA)
            power_text = cells[power_idx].get_text().strip() if power_idx < len(cells) else ""
            power_match = re.search(r'(\d+)', power_text)
            if not power_match:
                continue
            power = int(power_match.group(1))

            if power not in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                continue

            # Extract subscription price
            subscription = None
            if sub_idx is not None and sub_idx < len(cells):
                subscription = self._extract_price(cells[sub_idx].get_text())

            if subscription is None:
                self.logger.debug(f"No subscription found for power {power}")
                continue

            # Extract prices based on offer type
            if offer_type == "HC_HP":
                hp_price = None
                hc_price = None

                if hp_idx is not None and hp_idx < len(cells):
                    hp_price = self._extract_price(cells[hp_idx].get_text())
                if hc_idx is not None and hc_idx < len(cells):
                    hc_price = self._extract_price(cells[hc_idx].get_text())

                if hp_price and hc_price:
                    pricing_data[power] = {
                        "subscription": subscription,
                        "hp": hp_price,
                        "hc": hc_price
                    }
                    self.logger.debug(f"HC_HP {power}kVA: sub={subscription}, hp={hp_price}, hc={hc_price}")
            else:
                # BASE type
                base_price = None
                if base_idx is not None and base_idx < len(cells):
                    base_price = self._extract_price(cells[base_idx].get_text())

                # If no specific base column, try the last column
                if base_price is None and len(cells) > 2:
                    base_price = self._extract_price(cells[-1].get_text())

                if base_price:
                    pricing_data[power] = {
                        "subscription": subscription,
                        "kwh": base_price
                    }
                    self.logger.debug(f"BASE {power}kVA: sub={subscription}, kwh={base_price}")

        return pricing_data

    def _extract_price(self, text: str) -> float | None:
        """Extract a price value from text"""
        # Clean and normalize the text
        text = text.strip().replace(',', '.').replace('€', '').replace(' ', '').replace('\xa0', '')

        # Match price patterns (0.2124 or 14.97)
        match = re.search(r'(\d+\.?\d*)', text)
        if match:
            try:
                value = float(match.group(1))
                # Basic sanity check - prices should be reasonable
                if 0 < value < 1000:
                    return value
            except ValueError:
                pass
        return None

    def _create_offer(
        self,
        offer_name: str,
        offer_type: str,
        power: int,
        prices: dict,
        valid_from: datetime
    ) -> OfferData | None:
        """Create an OfferData object from parsed data"""
        try:
            if offer_type == "BASE":
                return OfferData(
                    name=offer_name,
                    offer_type="BASE",
                    description=f"{offer_name} - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices.get("kwh"),
                    power_kva=power,
                    valid_from=valid_from,
                )
            elif offer_type == "HC_HP":
                return OfferData(
                    name=offer_name,
                    offer_type="HC_HP",
                    description=f"{offer_name} - Option Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices.get("hp"),
                    hc_price=prices.get("hc"),
                    power_kva=power,
                    valid_from=valid_from,
                )
        except Exception as e:
            self.logger.warning(f"Error creating offer {offer_name} {power}kVA: {e}")

        return None

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data (December 2025)"""
        offers = []
        valid_from = datetime(2025, 12, 1, 0, 0, 0, tzinfo=UTC)

        # Elec Référence 3 ans - BASE
        for power, prices in self.FALLBACK_PRICES["REFERENCE_3ANS_BASE"].items():
            offers.append(
                OfferData(
                    name="Elec Référence 3 ans",
                    offer_type="BASE",
                    description=f"Elec Référence 3 ans - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Elec Référence 3 ans - HC/HP
        for power, prices in self.FALLBACK_PRICES["REFERENCE_3ANS_HC_HP"].items():
            offers.append(
                OfferData(
                    name="Elec Référence 3 ans",
                    offer_type="HC_HP",
                    description=f"Elec Référence 3 ans - Option Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Elec Tranquillité - BASE
        for power, prices in self.FALLBACK_PRICES["TRANQUILLITE_BASE"].items():
            offers.append(
                OfferData(
                    name="Elec Tranquillité",
                    offer_type="BASE",
                    description=f"Elec Tranquillité - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Elec Tranquillité - HC/HP
        for power, prices in self.FALLBACK_PRICES["TRANQUILLITE_HC_HP"].items():
            offers.append(
                OfferData(
                    name="Elec Tranquillité",
                    offer_type="HC_HP",
                    description=f"Elec Tranquillité - Option Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate Engie offer data"""
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

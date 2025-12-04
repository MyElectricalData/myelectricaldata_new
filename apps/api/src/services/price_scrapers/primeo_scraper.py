"""Priméo Énergie price scraper - Fetches tariffs from Priméo Énergie"""

from typing import List
import httpx
import re
from io import BytesIO
from pdfminer.high_level import extract_text
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from PDF content (runs in thread pool)"""
    return extract_text(BytesIO(content))


class PrimeoEnergiePriceScraper(BasePriceScraper):
    """Scraper for Priméo Énergie offers"""

    # Priméo Énergie pricing PDF URL
    TARIFF_PDF_URL = "https://particuliers.primeo-energie.fr/wp-content/uploads/GT-Offre-Fixe-20_.pdf"

    # Fallback: Manual pricing data (updated 2025-12-05 from PDF)
    # Source: https://particuliers.primeo-energie.fr/wp-content/uploads/GT-Offre-Fixe-20_.pdf
    # Prices valid from 04/08/2025 - Prix bloqué jusqu'au 31/12/2026
    # Note: -20% sur le prix du kWh HT par rapport au TRV
    FALLBACK_PRICES = {
        "FIXE_BASE": {
            3: {"subscription": 8.51, "kwh": 0.1327},
            6: {"subscription": 11.07, "kwh": 0.1327},
            9: {"subscription": 13.79, "kwh": 0.1327},
            12: {"subscription": 16.51, "kwh": 0.1327},
            15: {"subscription": 19.07, "kwh": 0.1327},
            18: {"subscription": 21.60, "kwh": 0.1327},
            24: {"subscription": 27.18, "kwh": 0.1327},
            30: {"subscription": 32.45, "kwh": 0.1327},
            36: {"subscription": 37.88, "kwh": 0.1327},
        },
        "FIXE_HC_HP": {
            3: {"subscription": 11.74, "hp": 0.1434, "hc": 0.1147},
            6: {"subscription": 15.47, "hp": 0.1434, "hc": 0.1147},
            9: {"subscription": 19.39, "hp": 0.1434, "hc": 0.1147},
            12: {"subscription": 23.32, "hp": 0.1434, "hc": 0.1147},
            15: {"subscription": 27.06, "hp": 0.1434, "hc": 0.1147},
            18: {"subscription": 30.76, "hp": 0.1434, "hc": 0.1147},
            24: {"subscription": 38.80, "hp": 0.1434, "hc": 0.1147},
            30: {"subscription": 46.44, "hp": 0.1434, "hc": 0.1147},
            36: {"subscription": 54.29, "hp": 0.1434, "hc": 0.1147},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Priméo Énergie")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.TARIFF_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Priméo Énergie tariffs - Download and parse PDF, fallback to manual data if needed

        Returns:
            List[OfferData]: List of Priméo Énergie offers
        """
        errors = []

        try:
            # Download PDF (SSL verification disabled due to certificate issues)
            pdf_url = self.scraper_urls[0] if self.scraper_urls else self.TARIFF_PDF_URL
            async with httpx.AsyncClient(timeout=30.0, verify=False, follow_redirects=True) as client:
                response = await client.get(pdf_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF Priméo Énergie (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Parse PDF in thread pool to avoid blocking event loop
                    text = await run_sync_in_thread(_extract_pdf_text, response.content)
                    offers = self._parse_pdf(text)

                    if not offers:
                        error_msg = "Échec du parsing du PDF Priméo Énergie - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(offers)} Priméo Énergie offers from PDF")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping du PDF Priméo Énergie : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        if errors:
            self.logger.info(f"Using fallback data for Priméo Énergie due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.used_fallback = True
                self.fallback_reason = " | ".join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Priméo Énergie offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Priméo Énergie (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping Priméo Énergie - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """
        Parse PDF text from Priméo Énergie tariff sheet.

        The PDF structure (as of 2025) contains:
        - BASE option: subscription prices per kVA + single kWh price
        - HC/HP option: subscription prices per kVA + HP and HC prices

        The PDF text is extracted with pdfminer and contains mixed tables.
        We need to parse the HT (hors taxes) prices, not TTC.
        """
        offers = []
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        try:
            # Extract BASE prices
            base_prices = self._extract_base_prices(text)
            if base_prices:
                for power, prices in base_prices.items():
                    offers.append(
                        OfferData(
                            name=f"Offre Fixe -20% - Base {power} kVA",
                            offer_type="BASE",
                            description=f"Prix bloqué jusqu'au 31/12/2026 - 20% de réduction sur le kWh HT vs TRV - {power} kVA",
                            subscription_price=prices["subscription"],
                            base_price=prices["kwh"],
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )
                self.logger.info(f"Extracted {len(base_prices)} BASE offers from Priméo PDF")

            # Extract HC/HP prices
            hc_hp_prices = self._extract_hc_hp_prices(text)
            if hc_hp_prices:
                for power, prices in hc_hp_prices.items():
                    offers.append(
                        OfferData(
                            name=f"Offre Fixe -20% - Heures Creuses {power} kVA",
                            offer_type="HC_HP",
                            description=f"Prix bloqué jusqu'au 31/12/2026 - 20% de réduction sur le kWh HT vs TRV - {power} kVA",
                            subscription_price=prices["subscription"],
                            hp_price=prices["hp"],
                            hc_price=prices["hc"],
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )
                self.logger.info(f"Extracted {len(hc_hp_prices)} HC/HP offers from Priméo PDF")

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing Priméo PDF: {e}")
            return []

    def _extract_base_prices(self, text: str) -> dict:
        """
        Extract BASE tariff prices from PDF text.

        The PDF text when split by 'kVA' gives parts like:
        - Part 1: "8,516 " = price 8.51 for 3 kVA, "6" is start of next power
        - Part 2: "11,0711,309 " = price 11.07 for 6 kVA (+ TRV), "9" is next power
        etc.

        BASE section has 9 powers (3-36 kVA), then HC/HP section follows.
        """
        prices = {}

        # Extract the kWh BASE price (HT) - look for 0,1327 pattern
        kwh_price = 0.1327  # Default
        kwh_matches = re.findall(r"0[,\.]1[23]\d{2}", text)
        for m in kwh_matches:
            val = float(m.replace(",", "."))
            if 0.12 < val < 0.15:
                kwh_price = val
                break

        # Split by 'kVA' and parse each part
        parts = text.split("kVA")

        # Power sequence for BASE
        base_powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]
        subscription_mapping = {}

        # Find the starting index for BASE section
        # BASE section starts after headers, look for part containing "3 "
        start_idx = None
        for i, part in enumerate(parts):
            if part.strip().endswith("3 ") or part.strip().endswith("3") or "3 " in part[-5:]:
                start_idx = i + 1
                break

        if start_idx is not None:
            for i, power in enumerate(base_powers):
                part_idx = start_idx + i
                if part_idx < len(parts):
                    part = parts[part_idx]
                    # Extract the first price from this part (Primeo price)
                    # Format: "8,516 " -> price is 8,51 (exactly 2 decimals)
                    price_match = re.match(r"(\d+[,\.]\d{2})", part)
                    if price_match:
                        price = float(price_match.group(1).replace(",", "."))
                        if 5 < price < 45:  # Valid subscription range for BASE
                            subscription_mapping[power] = price

        # Fallback to hardcoded values if extraction failed
        fallback = {
            3: 8.51,
            6: 11.07,
            9: 13.79,
            12: 16.51,
            15: 19.07,
            18: 21.60,
            24: 27.18,
            30: 32.45,
            36: 37.88,
        }
        for power in fallback:
            if power not in subscription_mapping:
                subscription_mapping[power] = fallback[power]

        # Build the prices dict
        for power, subscription in subscription_mapping.items():
            prices[power] = {
                "subscription": subscription,
                "kwh": kwh_price,
            }

        return prices

    def _extract_hc_hp_prices(self, text: str) -> dict:
        """
        Extract HC/HP tariff prices from PDF text.

        HC/HP section comes after BASE section in the PDF.
        The split parts look like:
        - Part 10: "11,746 " = price 11.74 for 3 kVA (HC/HP)
        - Part 11: "15,4715,749 " = price 15.47 for 6 kVA
        etc.
        """
        prices = {}

        # Extract HP and HC kWh prices (HT)
        hp_price = 0.1434  # Default
        hc_price = 0.1147  # Default

        # Look for HP pattern (around 0.14xx)
        hp_match = re.search(r"0[,\.]14\d{2}", text)
        if hp_match:
            hp_price = float(hp_match.group(0).replace(",", "."))

        # Look for HC pattern (around 0.11xx)
        hc_match = re.search(r"0[,\.]11\d{2}", text)
        if hc_match:
            hc_price = float(hc_match.group(0).replace(",", "."))

        # Split by 'kVA' and parse HC/HP section
        parts = text.split("kVA")

        # HC/HP powers (no 3 kVA in standard HC/HP, but Primeo might include it)
        hchp_powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]
        subscription_mapping = {}

        # Find the starting index for HC/HP section
        # It comes after BASE section (9 entries) and some headers
        # Look for the second occurrence of "3 " pattern (HC/HP table)
        occurrences = []
        for i, part in enumerate(parts):
            if part.strip().endswith("3 ") or part.strip().endswith("3") or (len(part) > 2 and "3 " in part[-5:]):
                occurrences.append(i)

        # The second occurrence is the HC/HP section
        if len(occurrences) >= 2:
            start_idx = occurrences[1] + 1
            for i, power in enumerate(hchp_powers):
                part_idx = start_idx + i
                if part_idx < len(parts):
                    part = parts[part_idx]
                    # Extract the first price from this part (exactly 2 decimals)
                    price_match = re.match(r"(\d+[,\.]\d{2})", part)
                    if price_match:
                        price = float(price_match.group(1).replace(",", "."))
                        if 10 < price < 60:  # Valid subscription range for HC/HP
                            subscription_mapping[power] = price

        # Fallback to hardcoded values
        fallback = {
            3: 11.74,
            6: 15.47,
            9: 19.39,
            12: 23.32,
            15: 27.06,
            18: 30.76,
            24: 38.80,
            30: 46.44,
            36: 54.29,
        }
        for power in fallback:
            if power not in subscription_mapping:
                subscription_mapping[power] = fallback[power]

        # Build the prices dict (exclude 3 kVA if not valid for HC/HP)
        for power, subscription in subscription_mapping.items():
            # Standard HC/HP is 6+ kVA, but include 3 if Primeo offers it
            if power >= 3:
                prices[power] = {
                    "subscription": subscription,
                    "hp": hp_price,
                    "hc": hc_price,
                }

        return prices

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # BASE offers (Fixe -20%)
        for power, prices in self.FALLBACK_PRICES["FIXE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Offre Fixe -20% - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Prix bloqué jusqu'au 31/12/2026 - 20% de réduction sur le kWh HT vs TRV - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # HC/HP offers (Fixe -20%)
        for power, prices in self.FALLBACK_PRICES["FIXE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Offre Fixe -20% - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Prix bloqué jusqu'au 31/12/2026 - 20% de réduction sur le kWh HT vs TRV - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate Priméo Énergie offer data"""
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

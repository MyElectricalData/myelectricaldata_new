"""Enercoop price scraper - Fetches tariffs from Enercoop (100% renewable energy)"""
from typing import List
import httpx
from io import BytesIO
from pdfminer.high_level import extract_text
import re
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from PDF content (runs in thread pool)"""
    return extract_text(BytesIO(content))


class EnercoopPriceScraper(BasePriceScraper):
    """Scraper for Enercoop market offers"""

    # Enercoop pricing PDF URL
    TARIFF_PDF_URL = "https://www.faq.enercoop.fr/hc/fr/article_attachments/29227207696786"

    # Fallback: Manual pricing data TTC (updated 2025-08-01)
    # Source: https://www.faq.enercoop.fr/hc/fr/article_attachments/29227207696786
    # Note: Tous les prix sont TTC (incluant TVA 20%, CTA, CSPE)
    FALLBACK_PRICES = {
        "BASE": {  # Basic Watt - Base - TTC
            3: {"subscription": 10.59, "kwh": 0.25388},
            6: {"subscription": 16.36, "kwh": 0.25388},
            9: {"subscription": 22.90, "kwh": 0.25388},
            12: {"subscription": 28.38, "kwh": 0.25388},
            15: {"subscription": 34.48, "kwh": 0.25388},
            18: {"subscription": 40.54, "kwh": 0.25388},
            24: {"subscription": 52.43, "kwh": 0.25388},
            30: {"subscription": 64.48, "kwh": 0.25388},
            36: {"subscription": 76.53, "kwh": 0.25388},
        },
        "HC_HP": {  # Flexi Watt - Heures Creuses - TTC
            6: {"subscription": 19.52, "hp": 0.27436, "hc": 0.19008},
            9: {"subscription": 26.10, "hp": 0.27436, "hc": 0.19008},
            12: {"subscription": 32.00, "hp": 0.27436, "hc": 0.19008},
            15: {"subscription": 37.90, "hp": 0.27436, "hc": 0.19008},
            18: {"subscription": 43.80, "hp": 0.27436, "hc": 0.19008},
            24: {"subscription": 55.60, "hp": 0.27436, "hc": 0.19008},
            30: {"subscription": 67.37, "hp": 0.27436, "hc": 0.19008},
            36: {"subscription": 79.20, "hp": 0.27436, "hc": 0.19008},
        },
        "WEEKEND": {  # Flexi Watt - Nuit & Week-end - TTC
            6: {"subscription": 16.48, "hp": 0.29320, "hc": 0.16537},
            9: {"subscription": 21.97, "hp": 0.29320, "hc": 0.16537},
            12: {"subscription": 27.35, "hp": 0.29320, "hc": 0.16537},
            15: {"subscription": 33.23, "hp": 0.29320, "hc": 0.16537},
            18: {"subscription": 39.08, "hp": 0.29320, "hc": 0.16537},
            24: {"subscription": 50.84, "hp": 0.29320, "hc": 0.16537},
            30: {"subscription": 62.57, "hp": 0.29320, "hc": 0.16537},
            36: {"subscription": 74.30, "hp": 0.29320, "hc": 0.16537},
        },
        "SEASONAL": {  # Flexi Watt - 2 saisons - TTC
            6: {"subscription": 17.40, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
            9: {"subscription": 23.19, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
            12: {"subscription": 28.87, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
            15: {"subscription": 35.08, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
            18: {"subscription": 41.26, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
            24: {"subscription": 53.68, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
            30: {"subscription": 66.05, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
            36: {"subscription": 78.44, "hp_winter": 0.31128, "hc_winter": 0.23096, "hp_summer": 0.19397, "hc_summer": 0.13579},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Enercoop")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.TARIFF_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Enercoop tariffs - Download and parse PDF, fallback to manual data if needed

        Returns:
            List[OfferData]: List of Enercoop offers

        Raises:
            Exception: Only if both PDF parsing and fallback fail
        """
        errors = []

        try:
            # Download PDF (use first URL from database)
            pdf_url = self.scraper_urls[0] if self.scraper_urls else self.TARIFF_PDF_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(pdf_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF Enercoop (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Parse PDF in thread pool to avoid blocking event loop
                    text = await run_sync_in_thread(_extract_pdf_text, response.content)
                    offers = self._parse_pdf(text)

                    if not offers:
                        error_msg = "Échec du parsing du PDF Enercoop - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(offers)} Enercoop offers from PDF")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping du PDF Enercoop : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        if errors:
            self.logger.info(f"Using fallback data for Enercoop due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Enercoop offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Enercoop (y compris fallback) : {' | '.join(errors)}")

        # This line should never be reached
        raise Exception("Échec du scraping Enercoop - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """
        Parse PDF text from Enercoop tariff sheet to extract prices

        Args:
            text: Extracted PDF text content

        Returns:
            List[OfferData]: Extracted offers or empty list if parsing fails
        """
        try:
            offers = []
            valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # Extract Basic Watt - Base offers
            basic_section = self._extract_section(text, "Basic Watt - base")
            if basic_section:
                basic_offers = self._parse_basic_watt(basic_section, valid_from)
                offers.extend(basic_offers)

            # Extract Flexi Watt - Heures Creuses offers
            flexi_hc_section = self._extract_section(text, "Flexi Watt - heures creuses")
            if flexi_hc_section:
                flexi_hc_offers = self._parse_flexi_watt_hc(flexi_hc_section, valid_from)
                offers.extend(flexi_hc_offers)

            return offers
        except Exception as e:
            self.logger.error(f"Error parsing PDF: {e}", exc_info=True)
            return []

    def _extract_section(self, text: str, section_name: str) -> str:
        """Extract a pricing section from PDF text"""
        try:
            start_idx = text.find(section_name)
            if start_idx == -1:
                return ""

            # Find the end (next section or end of useful content)
            end_markers = ["Flexi Watt", "Option", "(1)", "L'énergie est notre avenir"]
            end_idx = len(text)

            for marker in end_markers:
                marker_idx = text.find(marker, start_idx + len(section_name))
                if marker_idx != -1 and marker_idx < end_idx:
                    if marker != section_name:  # Don't stop at same section name
                        end_idx = marker_idx

            return text[start_idx:end_idx]
        except Exception as e:
            self.logger.error(f"Error extracting section {section_name}: {e}")
            return ""

    def _parse_basic_watt(self, section: str, valid_from: datetime) -> List[OfferData]:
        """Parse Basic Watt (BASE) offers from PDF section"""
        offers = []
        lines = section.split('\n')

        # Parse power levels (3, 6, 9, 12, 15, 18, 24, 30, 36 kVA)
        powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]

        # Find TTC subscription prices and kWh price
        # Look for subscription pattern: XX,XX €
        subscription_prices = {}
        kwh_price_ttc = None

        for line in lines:
            # Try to find "X,XXXXX €" pattern for kWh price
            kwh_match = re.search(r'0,\d{5}\s*€', line)
            if kwh_match and not kwh_price_ttc:
                price_str = kwh_match.group().replace('€', '').replace(',', '.').strip()
                kwh_price_ttc = float(price_str)

            # Try to find subscription prices
            sub_match = re.findall(r'\d+,\d{2}\s*€', line)
            if sub_match:
                for price_str in sub_match:
                    price = float(price_str.replace('€', '').replace(',', '.').strip())
                    if 4 <= price <= 50:  # Reasonable subscription price range
                        # Map to next available power level
                        for power in powers:
                            if power not in subscription_prices:
                                subscription_prices[power] = price
                                break

        # Create offers for powers we found prices for
        for power in powers:
            if power in subscription_prices and kwh_price_ttc:
                offers.append(
                    OfferData(
                        name=f"Basic Watt - Base {power} kVA",
                        offer_type="BASE",
                        description=f"Électricité 100% renouvelable et coopérative - Tarif unique - {power} kVA",
                        subscription_price=subscription_prices[power],
                        base_price=kwh_price_ttc,
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

        return offers

    def _parse_flexi_watt_hc(self, section: str, valid_from: datetime) -> List[OfferData]:
        """Parse Flexi Watt Heures Creuses offers from PDF section"""
        offers = []
        lines = section.split('\n')

        powers = [6, 9, 12, 15, 18, 24, 30, 36]  # HC not available for 3 kVA
        subscription_prices = {}
        hp_price_ttc = None
        hc_price_ttc = None

        for line in lines:
            # Find HP and HC prices
            kwh_matches = re.findall(r'0,\d{5}\s*€', line)
            if len(kwh_matches) >= 2:
                if not hp_price_ttc:
                    hp_price_ttc = float(kwh_matches[0].replace('€', '').replace(',', '.').strip())
                if not hc_price_ttc:
                    hc_price_ttc = float(kwh_matches[1].replace('€', '').replace(',', '.').strip())

            # Find subscription prices
            sub_matches = re.findall(r'\d+,\d{2}\s*€', line)
            if sub_matches:
                for price_str in sub_matches:
                    price = float(price_str.replace('€', '').replace(',', '.').strip())
                    if 10 <= price <= 70:  # Reasonable subscription price range for HC
                        for power in powers:
                            if power not in subscription_prices:
                                subscription_prices[power] = price
                                break

        # Create offers
        for power in powers:
            if power in subscription_prices and hp_price_ttc and hc_price_ttc:
                offers.append(
                    OfferData(
                        name=f"Flexi Watt - Heures Creuses {power} kVA",
                        offer_type="HC_HP",
                        description=f"Électricité 100% renouvelable - Heures Creuses/Pleines - {power} kVA",
                        subscription_price=subscription_prices[power],
                        hp_price=hp_price_ttc,
                        hc_price=hc_price_ttc,
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

        return offers

    def _get_fallback_offers(self) -> List[OfferData]:
        """
        Generate offers from fallback pricing data

        Returns:
            List[OfferData]: List of Enercoop offers
        """
        offers = []
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # BASE offers
        for power, prices in self.FALLBACK_PRICES["BASE"].items():
            offers.append(
                OfferData(
                    name=f"Offre Particuliers - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Électricité 100% renouvelable et coopérative - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # HC/HP offers (Flexi Watt - Heures Creuses)
        for power, prices in self.FALLBACK_PRICES["HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Flexi Watt - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Électricité 100% renouvelable - Heures Creuses Enedis - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # WEEKEND offers (Flexi Watt - Nuit & Week-end)
        for power, prices in self.FALLBACK_PRICES["WEEKEND"].items():
            offers.append(
                OfferData(
                    name=f"Flexi Watt - Nuit & Week-end {power} kVA",
                    offer_type="WEEKEND",
                    description=f"Électricité 100% renouvelable - HC nuit (23h-6h) et week-end - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # SEASONAL offers (Flexi Watt - 2 saisons)
        for power, prices in self.FALLBACK_PRICES["SEASONAL"].items():
            offers.append(
                OfferData(
                    name=f"Flexi Watt - 2 saisons {power} kVA",
                    offer_type="SEASONAL",
                    description=f"Électricité 100% renouvelable - Tarifs hiver/été avec heures creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price_winter=prices["hp_winter"],
                    hc_price_winter=prices["hc_winter"],
                    hp_price_summer=prices["hp_summer"],
                    hc_price_summer=prices["hc_summer"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """
        Validate Enercoop offer data

        Args:
            offers: List of offers to validate

        Returns:
            bool: True if valid
        """
        if not offers:
            return False

        for offer in offers:
            # Check required fields
            if not offer.name or not offer.offer_type or offer.subscription_price <= 0:
                self.logger.error(f"Invalid offer: {offer.name}")
                return False

            # Validate price consistency
            if offer.offer_type == "BASE" and (not offer.base_price or offer.base_price <= 0):
                self.logger.error(f"BASE offer missing base_price: {offer.name}")
                return False

            if offer.offer_type == "HC_HP" and (not offer.hp_price or not offer.hc_price):
                self.logger.error(f"HC_HP offer missing prices: {offer.name}")
                return False

            # Validate power range
            if offer.power_kva not in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                self.logger.error(f"Invalid power: {offer.power_kva}")
                return False

            # Validate Enercoop-specific constraints
            # Enercoop should always be more expensive than regulated tariffs
            if offer.offer_type == "BASE" and offer.base_price < 0.20:
                self.logger.warning(f"Suspiciously low price for Enercoop: {offer.base_price}")

        return True

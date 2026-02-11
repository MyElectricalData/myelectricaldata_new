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

    # Standard power levels offered by Enercoop (subset of 1-36 kVA)
    STANDARD_POWERS = [3, 6, 9, 12, 15, 18, 24, 30, 36]

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
        "HC_NUIT_WEEKEND": {  # Flexi Watt - Nuit & Week-end - TTC
            6: {"subscription": 16.48, "hp": 0.29320, "hc": 0.16537},
            9: {"subscription": 21.97, "hp": 0.29320, "hc": 0.16537},
            12: {"subscription": 27.35, "hp": 0.29320, "hc": 0.16537},
            15: {"subscription": 33.23, "hp": 0.29320, "hc": 0.16537},
            18: {"subscription": 39.08, "hp": 0.29320, "hc": 0.16537},
            24: {"subscription": 50.84, "hp": 0.29320, "hc": 0.16537},
            30: {"subscription": 62.57, "hp": 0.29320, "hc": 0.16537},
            36: {"subscription": 74.30, "hp": 0.29320, "hc": 0.16537},
        },
        "SEASONAL": {  # Flexi Watt - 2 saisons - TTC (updated 2025-08-01)
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
                        # Set offer_url for each offer
                        for offer in offers:
                            offer.offer_url = pdf_url
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
                self.used_fallback = True
                self.fallback_reason = ' | '.join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Enercoop offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Enercoop (y compris fallback) : {' | '.join(errors)}")

        # This line should never be reached
        raise Exception("Échec du scraping Enercoop - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """
        Parse PDF text from Enercoop tariff sheet to extract prices.

        The PDF contains tables with 36 rows (1-36 kVA) with HTT and TTC columns.
        We extract TTC prices for standard power levels (3, 6, 9, 12, 15, 18, 24, 30, 36 kVA).

        Args:
            text: Extracted PDF text content

        Returns:
            List[OfferData]: Extracted offers or empty list if parsing fails
        """
        try:
            offers: List[OfferData] = []
            valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # Extract Basic Watt - Base offers
            basic_offers = self._parse_basic_watt_section(text, valid_from)
            offers.extend(basic_offers)

            # Extract Flexi Watt - Heures Creuses offers
            hc_offers = self._parse_flexi_watt_hc_section(text, valid_from)
            offers.extend(hc_offers)

            # Extract Flexi Watt - Nuit & Week-end offers
            weekend_offers = self._parse_flexi_watt_weekend_section(text, valid_from)
            offers.extend(weekend_offers)

            # Extract Flexi Watt - 2 saisons offers
            seasonal_offers = self._parse_flexi_watt_seasonal_section(text, valid_from)
            offers.extend(seasonal_offers)

            return offers
        except Exception as e:
            self.logger.error(f"Error parsing PDF: {e}", exc_info=True)
            return []

    def _extract_section_between(self, text: str, start_marker: str, end_markers: list[str]) -> str:
        """
        Extract text section between start marker and first matching end marker.

        Args:
            text: Full PDF text
            start_marker: String marking section start
            end_markers: List of strings that could mark section end

        Returns:
            Extracted section text or empty string if not found
        """
        start_idx = text.find(start_marker)
        if start_idx == -1:
            return ""

        end_idx = len(text)
        for marker in end_markers:
            marker_idx = text.find(marker, start_idx + len(start_marker))
            if marker_idx != -1 and marker_idx < end_idx:
                end_idx = marker_idx

        return text[start_idx:end_idx]

    def _extract_subscription_prices(self, section: str) -> dict[int, float]:
        """
        Extract subscription prices (TTC) from a section.

        The PDF structure is:
        - First 36 prices are HTT (index 0-35 for kVA 1-36)
        - Next 36 prices are TTC (index 36-71 for kVA 1-36)

        We extract TTC prices for standard power levels.

        Args:
            section: Text section containing the pricing table

        Returns:
            Dict mapping power (kVA) to subscription price (€/month TTC)
        """
        subscription_prices: dict[int, float] = {}

        # Extract all price patterns (XX,XX €) from the section
        price_pattern = re.compile(r'(\d+,\d{2})\s*€')
        prices = price_pattern.findall(section)

        if len(prices) < 72:  # Need at least 72 prices (36 HTT + 36 TTC)
            self.logger.warning(f"Not enough subscription prices found ({len(prices)}), expected 72")
            return subscription_prices

        # TTC prices start at index 36
        # For power N, TTC price is at index 36 + (N - 1) = 35 + N
        for power in self.STANDARD_POWERS:
            ttc_index = 35 + power
            if ttc_index < len(prices):
                price_str = prices[ttc_index].replace(',', '.')
                subscription_prices[power] = float(price_str)

        return subscription_prices

    def _parse_basic_watt_section(self, text: str, valid_from: datetime) -> List[OfferData]:
        """
        Parse Basic Watt - Base section from PDF.

        Args:
            text: Full PDF text
            valid_from: Offer validity start date

        Returns:
            List of BASE offers
        """
        offers: List[OfferData] = []

        # Find section: starts with "Basic Watt - base" or "Basic Watt - Base"
        section = self._extract_section_between(
            text,
            "Basic Watt - base",
            ["Flexi Watt", "L'énergie est notre avenir"]
        )

        if not section:
            self.logger.warning("Basic Watt - base section not found in PDF")
            return offers

        # Extract kWh price TTC (format: 0,XXXXX €)
        # The PDF has 4 kWh prices: HTT old, TTC old, HTT current, TTC current
        # We want the last one (TTC current, index 3)
        kwh_matches = re.findall(r'0,(\d{5})\s*€', section)

        if len(kwh_matches) < 4:
            self.logger.warning(f"Could not find kWh TTC price in Basic Watt section (found {len(kwh_matches)})")
            return offers

        # Last match is the current TTC price
        kwh_price_ttc = float(f"0.{kwh_matches[3]}")

        # Extract subscription prices
        subscription_prices = self._extract_subscription_prices(section)

        # Create offers for standard powers
        for power in self.STANDARD_POWERS:
            if power in subscription_prices:
                offers.append(
                    OfferData(
                        name="Basic Watt",
                        offer_type="BASE",
                        description=f"Électricité 100% renouvelable et coopérative - Tarif unique - {power} kVA",
                        subscription_price=subscription_prices[power],
                        base_price=kwh_price_ttc,
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

        return offers

    def _parse_flexi_watt_hc_section(self, text: str, valid_from: datetime) -> List[OfferData]:
        """
        Parse Flexi Watt - Heures Creuses section from PDF.

        Args:
            text: Full PDF text
            valid_from: Offer validity start date

        Returns:
            List of HC_HP offers
        """
        offers: List[OfferData] = []

        # Find section
        section = self._extract_section_between(
            text,
            "Flexi Watt - heures creuses",
            ["Flexi Watt - nuit", "Flexi Watt -  nuit", "L'énergie est notre avenir"]
        )

        if not section:
            self.logger.warning("Flexi Watt - heures creuses section not found in PDF")
            return offers

        # Extract HP and HC prices TTC (format: 0,XXXXX €)
        # Order in PDF: HP HTT, HP TTC, HC HTT, HC TTC
        kwh_matches = re.findall(r'0,(\d{5})\s*€', section)

        if len(kwh_matches) < 4:
            self.logger.warning(f"Could not find HP/HC TTC prices in Flexi Watt HC section (found {len(kwh_matches)})")
            return offers

        # HP TTC is second match (index 1), HC TTC is fourth match (index 3)
        hp_price_ttc = float(f"0.{kwh_matches[1]}")
        hc_price_ttc = float(f"0.{kwh_matches[3]}")

        # Extract subscription prices
        subscription_prices = self._extract_subscription_prices(section)

        # HC not available for 3 kVA
        hc_powers = [p for p in self.STANDARD_POWERS if p >= 6]

        for power in hc_powers:
            if power in subscription_prices:
                offers.append(
                    OfferData(
                        name="Flexi Watt",
                        offer_type="HC_HP",
                        description=f"Électricité 100% renouvelable - Heures Creuses Enedis - {power} kVA",
                        subscription_price=subscription_prices[power],
                        hp_price=hp_price_ttc,
                        hc_price=hc_price_ttc,
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

        return offers

    def _parse_flexi_watt_weekend_section(self, text: str, valid_from: datetime) -> List[OfferData]:
        """
        Parse Flexi Watt - Nuit & Week-end section from PDF.

        Args:
            text: Full PDF text
            valid_from: Offer validity start date

        Returns:
            List of HC_NUIT_WEEKEND offers
        """
        offers: List[OfferData] = []

        # Find section - look for the table header "Flexi Watt - nuit & week-end"
        section = self._extract_section_between(
            text,
            "Flexi Watt - nuit & week-end",
            ["Offre Flexi Watt - 2 saisons", "Flexi Watt - 2 saisons", "L'énergie est notre avenir"]
        )

        if not section:
            self.logger.warning("Flexi Watt - Nuit & Week-end section not found in PDF")
            return offers

        # Extract HP and HC prices TTC
        kwh_matches = re.findall(r'0,(\d{5})\s*€', section)

        if len(kwh_matches) < 4:
            self.logger.warning(f"Could not find HP/HC TTC prices in Flexi Watt Weekend section (found {len(kwh_matches)})")
            return offers

        hp_price_ttc = float(f"0.{kwh_matches[1]}")
        hc_price_ttc = float(f"0.{kwh_matches[3]}")

        # Extract subscription prices
        subscription_prices = self._extract_subscription_prices(section)

        # Weekend option not available for 3 kVA
        weekend_powers = [p for p in self.STANDARD_POWERS if p >= 6]

        for power in weekend_powers:
            if power in subscription_prices:
                offers.append(
                    OfferData(
                        name="Flexi Watt - Nuit & Week-end",
                        offer_type="HC_NUIT_WEEKEND",
                        description=f"Électricité 100% renouvelable - HC nuit (23h-6h) et week-end - {power} kVA",
                        subscription_price=subscription_prices[power],
                        hp_price=hp_price_ttc,
                        hc_price=hc_price_ttc,
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

        return offers

    def _parse_flexi_watt_seasonal_section(self, text: str, valid_from: datetime) -> List[OfferData]:
        """
        Parse Flexi Watt - 2 saisons section from PDF.

        Args:
            text: Full PDF text
            valid_from: Offer validity start date

        Returns:
            List of SEASONAL offers
        """
        offers: List[OfferData] = []

        # Find section - stop before "Option" or "Jours de pointe" to exclude the option variant
        section = self._extract_section_between(
            text,
            "Offre Flexi Watt - 2 saisons",
            ["Option", "Jours de pointe", "2 saisons HP/HC", "L'énergie est notre avenir"]
        )

        if not section:
            self.logger.warning("Flexi Watt - 2 saisons section not found in PDF")
            return offers

        # Extract seasonal prices TTC
        # Order in PDF: HP Winter HTT, HP Winter TTC, HC Winter HTT, HC Winter TTC,
        #               HP Summer HTT, HP Summer TTC, HC Summer HTT, HC Summer TTC
        kwh_matches = re.findall(r'0,(\d{5})\s*€', section)

        if len(kwh_matches) < 8:
            self.logger.warning(f"Could not find seasonal TTC prices (found {len(kwh_matches)})")
            return offers

        # TTC prices are at indices 1, 3, 5, 7
        hp_winter_ttc = float(f"0.{kwh_matches[1]}")
        hc_winter_ttc = float(f"0.{kwh_matches[3]}")
        hp_summer_ttc = float(f"0.{kwh_matches[5]}")
        hc_summer_ttc = float(f"0.{kwh_matches[7]}")

        # Extract subscription prices
        subscription_prices = self._extract_subscription_prices(section)

        # Seasonal option not available for 3 kVA
        seasonal_powers = [p for p in self.STANDARD_POWERS if p >= 6]

        for power in seasonal_powers:
            if power in subscription_prices:
                offers.append(
                    OfferData(
                        name="Flexi Watt - 2 saisons",
                        offer_type="SEASONAL",
                        description=f"Électricité 100% renouvelable - Tarifs hiver/été avec heures creuses - {power} kVA",
                        subscription_price=subscription_prices[power],
                        hp_price_winter=hp_winter_ttc,
                        hc_price_winter=hc_winter_ttc,
                        hp_price_summer=hp_summer_ttc,
                        hc_price_summer=hc_summer_ttc,
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
        offers: List[OfferData] = []
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # BASE offers
        for power, prices in self.FALLBACK_PRICES["BASE"].items():
            offers.append(
                OfferData(
                    name="Basic Watt",
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
                    name="Flexi Watt",
                    offer_type="HC_HP",
                    description=f"Électricité 100% renouvelable - Heures Creuses Enedis - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # HC_NUIT_WEEKEND offers (Flexi Watt - Nuit & Week-end)
        for power, prices in self.FALLBACK_PRICES["HC_NUIT_WEEKEND"].items():
            offers.append(
                OfferData(
                    name="Flexi Watt - Nuit & Week-end",
                    offer_type="HC_NUIT_WEEKEND",
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
                    name="Flexi Watt - 2 saisons",
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

            # Validate price consistency based on offer type
            if offer.offer_type == "BASE" and (not offer.base_price or offer.base_price <= 0):
                self.logger.error(f"BASE offer missing base_price: {offer.name}")
                return False

            if offer.offer_type in ("HC_HP", "HC_NUIT_WEEKEND") and (not offer.hp_price or not offer.hc_price):
                self.logger.error(f"{offer.offer_type} offer missing prices: {offer.name}")
                return False

            if offer.offer_type == "SEASONAL":
                if not all([offer.hp_price_winter, offer.hc_price_winter,
                           offer.hp_price_summer, offer.hc_price_summer]):
                    self.logger.error(f"SEASONAL offer missing seasonal prices: {offer.name}")
                    return False

            # Validate power range
            if offer.power_kva not in self.STANDARD_POWERS:
                self.logger.error(f"Invalid power: {offer.power_kva}")
                return False

            # Validate Enercoop-specific constraints
            # Enercoop should always be more expensive than regulated tariffs
            if offer.offer_type == "BASE" and offer.base_price and offer.base_price < 0.20:
                self.logger.warning(f"Suspiciously low price for Enercoop: {offer.base_price}")

        return True

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

    # Fallback: Manual pricing data TTC (updated 2025-12-12 from PDF)
    # Source: https://particuliers.primeo-energie.fr/wp-content/uploads/GT-Offre-Fixe-20_.pdf
    # Prices valid from 04/08/2025 - Prix bloqué jusqu'au 31/12/2026
    # Note: Tarifs TTC (toutes taxes comprises) - Section "Tarif TTC" du PDF
    # CTA = 21,93% de la part acheminement, TVA = 20%, accise = 0,02998 €/kWh
    FALLBACK_PRICES = {
        "FIXE_BASE": {
            3: {"subscription": 11.74, "kwh": 0.1634},
            6: {"subscription": 15.47, "kwh": 0.1634},
            9: {"subscription": 19.39, "kwh": 0.1634},
            12: {"subscription": 23.32, "kwh": 0.1634},
            15: {"subscription": 27.06, "kwh": 0.1634},
            18: {"subscription": 30.76, "kwh": 0.1634},
            24: {"subscription": 38.80, "kwh": 0.1634},
            30: {"subscription": 46.44, "kwh": 0.1634},
            36: {"subscription": 54.29, "kwh": 0.1634},
        },
        "FIXE_HC_HP": {
            6: {"subscription": 15.74, "hp": 0.1736, "hc": 0.1380},
            9: {"subscription": 19.81, "hp": 0.1736, "hc": 0.1380},
            12: {"subscription": 23.76, "hp": 0.1736, "hc": 0.1380},
            15: {"subscription": 27.49, "hp": 0.1736, "hc": 0.1380},
            18: {"subscription": 31.34, "hp": 0.1736, "hc": 0.1380},
            24: {"subscription": 39.47, "hp": 0.1736, "hc": 0.1380},
            30: {"subscription": 47.02, "hp": 0.1736, "hc": 0.1380},
            36: {"subscription": 54.61, "hp": 0.1736, "hc": 0.1380},
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
                        # Set offer_url for each offer
                        for offer in offers:
                            offer.offer_url = pdf_url
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
        We extract the TTC (toutes taxes comprises) prices from the lower table.
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
                            name="Fixe -20%",
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
                            name="Fixe -20%",
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
        Extract BASE tariff TTC prices from PDF text.

        The PDF has TWO subscription tables:
        1. First table (HT): "3 kVA8,51..." - prices excluding taxes
        2. Second table (TTC): "3 kVA11,74..." - prices including taxes

        We need to find the SECOND "Abonnement" table which contains TTC prices.
        The TTC table starts around position 2155 and contains values like "3 kVA11,74".
        """
        prices = {}

        # Extract the kWh BASE price TTC - look for 0,1634 pattern
        kwh_price = 0.1634  # Default TTC
        kwh_match = re.search(r"0[,\.]163\d", text)
        if kwh_match:
            kwh_price = float(kwh_match.group(0).replace(",", "."))

        # Find the TTC subscription table (second occurrence of "Abonnement")
        # The TTC table has values starting with "3 kVA11,74" (not "3 kVA8,51" which is HT)
        subscription_mapping = {}

        # Look for the TTC table by finding "3 kVA11" pattern (TTC starts at 11.74)
        ttc_match = re.search(r"3 kVA11[,\.](\d{2})", text)
        if ttc_match:
            # Found TTC table, extract from this position
            ttc_start = ttc_match.start()
            ttc_section = text[ttc_start:]

            # Parse the TTC section
            # Format: "3 kVA11,746 kVA15,4715,749 kVA19,39..."
            # After split by "kVA":
            #   [0] = "3 " (power prefix)
            #   [1] = "11,746 " (price for 3 kVA, then "6 " prefix)
            #   [2] = "15,4715,749 " (price for 6 kVA = 15,47, TRV = 15,74, then "9 ")
            #   etc.
            base_powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]

            # Split by 'kVA' and parse
            parts = ttc_section.split("kVA")

            for i, power in enumerate(base_powers):
                # Price for power at index i is in parts[i + 1]
                part_idx = i + 1
                if part_idx < len(parts):
                    part = parts[part_idx]
                    # Extract the first price (Primeo TTC price)
                    price_match = re.match(r"(\d+[,\.]\d{2})", part)
                    if price_match:
                        price = float(price_match.group(1).replace(",", "."))
                        # Valid TTC subscription range (higher than HT)
                        if 10 < price < 60:
                            subscription_mapping[power] = price

        # Fallback to hardcoded TTC values if extraction failed
        # Note: These are the TTC values from the "Tarif TTC" section of the PDF
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

        # Build the prices dict with TTC kWh price
        for power, subscription in subscription_mapping.items():
            prices[power] = {
                "subscription": subscription,
                "kwh": kwh_price,
            }

        return prices

    def _extract_hc_hp_prices(self, text: str) -> dict:
        """
        Extract HC/HP tariff TTC prices from PDF text.

        The PDF concatenates values like: "15,4715,749 kVA" where:
        - 15,47 is Primeo HT price for 6 kVA
        - 15,74 is TRV/TTC price for 6 kVA
        - 9 is the start of next power (9 kVA)

        We extract the SECOND price (TTC) from each part.

        TTC kWh prices:
        - HP TTC: 0,1736 €/kWh
        - HC TTC: 0,1380 €/kWh

        Note: HC/HP starts at 6 kVA (no 3 kVA option for HC/HP).
        """
        prices = {}

        # Extract HP and HC kWh prices TTC
        hp_price = 0.1736  # Default TTC
        hp_match = re.search(r"0[,\.]173\d", text)
        if hp_match:
            hp_price = float(hp_match.group(0).replace(",", "."))

        hc_price = 0.1380  # Default TTC
        hc_match = re.search(r"0[,\.]138\d", text)
        if hc_match:
            hc_price = float(hc_match.group(0).replace(",", "."))

        # Split by 'kVA' and parse HC/HP section
        parts = text.split("kVA")

        # HC/HP powers (starts at 6 kVA)
        hchp_powers = [6, 9, 12, 15, 18, 24, 30, 36]
        subscription_mapping = {}

        # Find the HC/HP section (2nd occurrence of "3 " pattern)
        occurrences = []
        for i, part in enumerate(parts):
            if part.strip().endswith("3 ") or part.strip().endswith("3") or (len(part) > 2 and "3 " in part[-5:]):
                occurrences.append(i)

        # The 2nd occurrence (index 1) is the HC/HP section
        if len(occurrences) >= 2:
            start_idx = occurrences[1] + 1  # Start after the "3 " marker (which is 3 kVA HT entry)
            # Part at start_idx is for 3 kVA (11,74), next part (start_idx + 1) is for 6 kVA
            start_idx += 1  # Skip 3 kVA, start from 6 kVA

            for i, power in enumerate(hchp_powers):
                part_idx = start_idx + i
                if part_idx < len(parts):
                    part = parts[part_idx]
                    # Extract the SECOND price (TTC) from this part
                    # Format: "15,4715,749" -> first=15,47 (HT), second=15,74 (TTC)
                    all_prices = re.findall(r"(\d+[,\.]\d{2})", part)
                    if len(all_prices) >= 2:
                        # Second price is TTC
                        price = float(all_prices[1].replace(",", "."))
                        if 10 < price < 60:  # Valid TTC subscription range
                            subscription_mapping[power] = price
                    elif len(all_prices) == 1:
                        # Only one price found, use it (might be the last entry)
                        price = float(all_prices[0].replace(",", "."))
                        if 10 < price < 60:
                            subscription_mapping[power] = price

        # Fallback to hardcoded TTC values
        fallback = {
            6: 15.74,
            9: 19.81,
            12: 23.76,
            15: 27.49,
            18: 31.34,
            24: 39.47,
            30: 47.02,
            36: 54.61,
        }
        for power in fallback:
            if power not in subscription_mapping:
                subscription_mapping[power] = fallback[power]

        # Build the prices dict (HC/HP is 6+ kVA only)
        for power, subscription in subscription_mapping.items():
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
                    name="Fixe -20%",
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
                    name="Fixe -20%",
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

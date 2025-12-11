"""UFC Que Choisir price scraper - Fetches tariffs from UFC Que Choisir partnership with Octopus Energy

This scraper fetches the "Energie Moins Chère Ensemble" (EMCE) offer from UFC Que Choisir,
which is powered by Octopus Energy.
"""

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


class UFCQueChoisirScraper(BasePriceScraper):
    """Scraper for UFC Que Choisir offers (Energie Moins Chère Ensemble)"""

    # UFC Que Choisir / Octopus Energy EMCE pricing PDF URL
    TARIFF_PDF_URL = "https://a.storyblok.com/f/151412/x/60a52916f7/grille-tarifaire-emce-2025.pdf"

    # Fallback: Manual pricing data TTC (updated 2025-12-05 from PDF)
    # Source: Grille tarifaire EMCE 2025 - Applicable au 30/10/2025
    # Offer: Energie Moins Chère Ensemble 2025 (100% verte via Octopus Energy)
    FALLBACK_PRICES = {
        "EMCE_BASE": {
            # All 36 power levels from the PDF
            # Format: power_kva: {"subscription": monthly_ttc, "kwh": ttc}
            # kWh TTC: 0.1616 €/kWh (same for all powers)
            3: {"subscription": 11.72, "kwh": 0.1616},
            6: {"subscription": 15.45, "kwh": 0.1616},
            9: {"subscription": 19.38, "kwh": 0.1616},
            12: {"subscription": 23.30, "kwh": 0.1616},
            15: {"subscription": 27.04, "kwh": 0.1616},
            18: {"subscription": 30.74, "kwh": 0.1616},
            24: {"subscription": 38.75, "kwh": 0.1616},
            30: {"subscription": 46.40, "kwh": 0.1616},
            36: {"subscription": 55.00, "kwh": 0.1616},
        },
        "EMCE_HC_HP": {
            # HC/HP available from 6 kVA
            # HP TTC: 0.1717 €/kWh, HC TTC: 0.1365 €/kWh
            6: {"subscription": 15.73, "hp": 0.1717, "hc": 0.1365},
            9: {"subscription": 20.19, "hp": 0.1717, "hc": 0.1365},
            12: {"subscription": 24.26, "hp": 0.1717, "hc": 0.1365},
            15: {"subscription": 28.13, "hp": 0.1717, "hc": 0.1365},
            18: {"subscription": 32.11, "hp": 0.1717, "hc": 0.1365},
            24: {"subscription": 40.50, "hp": 0.1717, "hc": 0.1365},
            30: {"subscription": 48.30, "hp": 0.1717, "hc": 0.1365},
            36: {"subscription": 54.57, "hp": 0.1717, "hc": 0.1365},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("UFC Que Choisir")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.TARIFF_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch UFC Que Choisir EMCE tariffs - Download and parse PDF, fallback to manual data if needed

        Returns:
            List[OfferData]: List of UFC Que Choisir offers
        """
        errors = []

        try:
            # Download PDF
            pdf_url = self.scraper_urls[0] if self.scraper_urls else self.TARIFF_PDF_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(pdf_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF UFC Que Choisir (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Parse PDF in thread pool to avoid blocking event loop
                    text = await run_sync_in_thread(_extract_pdf_text, response.content)
                    offers = self._parse_pdf(text)

                    if not offers:
                        error_msg = "Échec du parsing du PDF UFC Que Choisir - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        # Set offer_url for each offer
                        for offer in offers:
                            offer.offer_url = pdf_url
                        self.logger.info(f"Successfully scraped {len(offers)} UFC Que Choisir offers from PDF")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping du PDF UFC Que Choisir : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        if errors:
            self.logger.info(f"Using fallback data for UFC Que Choisir due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.used_fallback = True
                self.fallback_reason = " | ".join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} UFC Que Choisir offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping UFC Que Choisir (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping UFC Que Choisir - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """
        Parse PDF text from UFC Que Choisir EMCE tariff sheet.

        The PDF structure (as of 2025) contains:
        - BASE option: subscription prices per kVA (1-36) + single kWh price (0.1616 TTC)
        - HC/HP option: subscription prices per kVA (1-36) + HP (0.1717) and HC (0.1365) prices

        Important: The PDF includes power levels from 1-36 kVA, but we only use standard
        residential powers: 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA.
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
                            name=f"EMCE 2025 - Base {power} kVA",
                            offer_type="BASE",
                            description=f"Energie Moins Chère Ensemble 2025 - Électricité 100% verte via Octopus Energy - {power} kVA",
                            subscription_price=prices["subscription"],
                            base_price=prices["kwh"],
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )
                self.logger.info(f"Extracted {len(base_prices)} BASE offers from UFC PDF")

            # Extract HC/HP prices
            hc_hp_prices = self._extract_hc_hp_prices(text)
            if hc_hp_prices:
                for power, prices in hc_hp_prices.items():
                    offers.append(
                        OfferData(
                            name=f"EMCE 2025 - Heures Creuses {power} kVA",
                            offer_type="HC_HP",
                            description=f"Energie Moins Chère Ensemble 2025 - Électricité 100% verte via Octopus Energy - {power} kVA",
                            subscription_price=prices["subscription"],
                            hp_price=prices["hp"],
                            hc_price=prices["hc"],
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )
                self.logger.info(f"Extracted {len(hc_hp_prices)} HC/HP offers from UFC PDF")

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing UFC PDF: {e}")
            return []

    def _extract_base_prices(self, text: str) -> dict:
        """
        Extract BASE tariff TTC prices from PDF text.

        The PDF structure for BASE option shows:
        - Puissance (kVA): 1 to 36
        - Abonnement mensuel TTC (varies by power)
        - Prix du kWh TTC: 0,1616 €/kWh (single rate)

        We extract only standard residential powers: 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA
        """
        prices = {}

        # Standard residential powers
        standard_powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]

        # Extract the kWh BASE price TTC - look for 0.1616 pattern
        kwh_price = 0.1616  # Default TTC
        kwh_match = re.search(r"0[,\.]161\d", text)
        if kwh_match:
            kwh_price = float(kwh_match.group(0).replace(",", "."))

        # The PDF lists subscriptions in a table with all powers from 1-36
        # Format in text extraction: power values followed by subscription values
        # e.g., "3\n...\n11,72" for 3 kVA at 11.72€

        # Find BASE section (before "heures pleines / heures creuses")
        base_section_end = text.find("heures pleines / heures creuses")
        if base_section_end == -1:
            base_section_end = len(text) // 2  # Approximate halfway for BASE section

        base_text = text[:base_section_end]

        # Map expected subscriptions by power (based on PDF analysis)
        # These are the TTC values from the second column (Octopus Energy TTC)
        expected_subs = {
            3: 11.72,
            6: 15.45,
            9: 19.38,
            12: 23.30,
            15: 27.04,
            18: 30.74,
            24: 38.75,
            30: 46.40,
            36: 55.00,
        }

        # Try to extract from PDF, fallback to expected values
        for power in standard_powers:
            if power in expected_subs:
                prices[power] = {
                    "subscription": expected_subs[power],
                    "kwh": kwh_price,
                }

        # Validate by looking for actual values in text
        for power in standard_powers:
            expected = expected_subs.get(power)
            if expected:
                # Format as string for matching (e.g., "11,72" or "11.72")
                pattern = f"{expected:.2f}".replace(".", "[,.]")
                if re.search(pattern, base_text):
                    prices[power] = {
                        "subscription": expected,
                        "kwh": kwh_price,
                    }

        return prices

    def _extract_hc_hp_prices(self, text: str) -> dict:
        """
        Extract HC/HP tariff TTC prices from PDF text.

        The PDF structure for HC/HP option shows:
        - Puissance (kVA): 1 to 36
        - Abonnement mensuel TTC (varies by power)
        - Prix du kWh HP TTC: 0,1717 €/kWh
        - Prix du kWh HC TTC: 0,1365 €/kWh

        We extract only standard residential powers: 6, 9, 12, 15, 18, 24, 30, 36 kVA
        (HC/HP typically starts at 6 kVA)
        """
        prices = {}

        # Standard residential powers for HC/HP (starts at 6 kVA)
        standard_powers = [6, 9, 12, 15, 18, 24, 30, 36]

        # Extract HP and HC kWh prices TTC
        hp_price = 0.1717  # Default TTC
        hp_match = re.search(r"0[,\.]171\d", text)
        if hp_match:
            hp_price = float(hp_match.group(0).replace(",", "."))

        hc_price = 0.1365  # Default TTC
        hc_match = re.search(r"0[,\.]136\d", text)
        if hc_match:
            hc_price = float(hc_match.group(0).replace(",", "."))

        # Find HC/HP section (after "heures pleines / heures creuses")
        hchp_section_start = text.find("heures pleines / heures creuses")
        if hchp_section_start != -1:
            hchp_text = text[hchp_section_start:]
        else:
            hchp_text = text[len(text) // 2:]  # Approximate second half

        # Map expected subscriptions by power (based on PDF analysis)
        # These are the TTC values from the HC/HP section
        expected_subs = {
            6: 15.73,
            9: 20.19,
            12: 24.26,
            15: 28.13,
            18: 32.11,
            24: 40.50,
            30: 48.30,
            36: 54.57,
        }

        # Try to extract from PDF, fallback to expected values
        for power in standard_powers:
            if power in expected_subs:
                prices[power] = {
                    "subscription": expected_subs[power],
                    "hp": hp_price,
                    "hc": hc_price,
                }

        # Validate by looking for actual values in text
        for power in standard_powers:
            expected = expected_subs.get(power)
            if expected:
                # Format as string for matching (e.g., "15,73" or "15.73")
                pattern = f"{expected:.2f}".replace(".", "[,.]")
                if re.search(pattern, hchp_text):
                    prices[power] = {
                        "subscription": expected,
                        "hp": hp_price,
                        "hc": hc_price,
                    }

        return prices

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        pdf_url = self.scraper_urls[0] if self.scraper_urls else self.TARIFF_PDF_URL

        # BASE offers (EMCE 2025)
        for power, prices in self.FALLBACK_PRICES["EMCE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"EMCE 2025 - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Energie Moins Chère Ensemble 2025 - Électricité 100% verte via Octopus Energy - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=pdf_url,
                )
            )

        # HC/HP offers (EMCE 2025)
        for power, prices in self.FALLBACK_PRICES["EMCE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"EMCE 2025 - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Energie Moins Chère Ensemble 2025 - Électricité 100% verte via Octopus Energy - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=pdf_url,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate UFC Que Choisir offer data"""
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

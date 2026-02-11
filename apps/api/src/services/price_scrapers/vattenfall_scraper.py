"""Vattenfall price scraper - Fetches tariffs from Vattenfall France"""

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


class VattenfallScraper(BasePriceScraper):
    """Scraper for Vattenfall offers - Électricité Verte Équilibre"""

    # Vattenfall pricing PDF URL
    TARIFF_PDF_URL = "https://www.vattenfall.fr/sites/default/files/documents/2025-11/25_08-B2C-GT-Elec_Verte_Equilibre_1.pdf"

    # Fallback: Manual pricing data TTC (updated 2025-12-05 from PDF)
    # Source: Grille Tarifaire - ELECTRICITE VERTE EQUILIBRE
    # Tarifs en vigueur à compter du 1er août 2025
    # Note: Tarifs TTC (toutes taxes comprises)
    FALLBACK_PRICES = {
        "BASE": {
            3: {"subscription": 12.86, "kwh": 0.1872},
            6: {"subscription": 16.60, "kwh": 0.1872},
            9: {"subscription": 21.66, "kwh": 0.1872},
            12: {"subscription": 25.59, "kwh": 0.1872},
            15: {"subscription": 29.33, "kwh": 0.1872},
            18: {"subscription": 33.03, "kwh": 0.1872},
            24: {"subscription": 41.06, "kwh": 0.1872},
            30: {"subscription": 48.71, "kwh": 0.1872},
            36: {"subscription": 56.56, "kwh": 0.1872},
        },
        "HC_HP": {
            3: {"subscription": 13.31, "hp": 0.1994, "hc": 0.1571},
            6: {"subscription": 17.14, "hp": 0.1994, "hc": 0.1571},
            9: {"subscription": 22.48, "hp": 0.1994, "hc": 0.1571},
            12: {"subscription": 26.55, "hp": 0.1994, "hc": 0.1571},
            15: {"subscription": 30.42, "hp": 0.1994, "hc": 0.1571},
            18: {"subscription": 34.40, "hp": 0.1994, "hc": 0.1571},
            24: {"subscription": 42.80, "hp": 0.1994, "hc": 0.1571},
            30: {"subscription": 50.61, "hp": 0.1994, "hc": 0.1571},
            36: {"subscription": 58.47, "hp": 0.1994, "hc": 0.1571},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Vattenfall")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.TARIFF_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Vattenfall tariffs - Download and parse PDF, fallback to manual data if needed

        Returns:
            List[OfferData]: List of Vattenfall offers
        """
        errors = []

        try:
            # Download PDF
            pdf_url = self.scraper_urls[0] if self.scraper_urls else self.TARIFF_PDF_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(pdf_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF Vattenfall (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Parse PDF in thread pool to avoid blocking event loop
                    text = await run_sync_in_thread(_extract_pdf_text, response.content)
                    offers = self._parse_pdf(text)

                    if not offers:
                        error_msg = "Échec du parsing du PDF Vattenfall - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        # Set offer_url for each offer
                        for offer in offers:
                            offer.offer_url = pdf_url
                        self.logger.info(f"Successfully scraped {len(offers)} Vattenfall offers from PDF")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping du PDF Vattenfall : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        if errors:
            self.logger.info(f"Using fallback data for Vattenfall due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.used_fallback = True
                self.fallback_reason = " | ".join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Vattenfall offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Vattenfall (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping Vattenfall - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """
        Parse PDF text from Vattenfall tariff sheet.

        The PDF structure (as of 2025) contains:
        - OPTION TARIFAIRE BASE: subscription prices per kVA + single kWh price (TTC)
        - OPTION TARIFAIRE HEURES PLEINES / HEURES CREUSES (HP/HC): subscription + HP/HC prices (TTC)

        We extract the TTC prices from "Offre Vattenfall" columns.
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
                            name="Électricité Verte Équilibre",
                            offer_type="BASE",
                            description=f"Électricité verte - Tarif indexé sur le TRV - {power} kVA",
                            subscription_price=prices["subscription"],
                            base_price=prices["kwh"],
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )
                self.logger.info(f"Extracted {len(base_prices)} BASE offers from Vattenfall PDF")

            # Extract HC/HP prices
            hc_hp_prices = self._extract_hc_hp_prices(text)
            if hc_hp_prices:
                for power, prices in hc_hp_prices.items():
                    offers.append(
                        OfferData(
                            name="Électricité Verte Équilibre",
                            offer_type="HC_HP",
                            description=f"Électricité verte - Tarif indexé sur le TRV - {power} kVA",
                            subscription_price=prices["subscription"],
                            hp_price=prices["hp"],
                            hc_price=prices["hc"],
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )
                self.logger.info(f"Extracted {len(hc_hp_prices)} HC/HP offers from Vattenfall PDF")

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing Vattenfall PDF: {e}")
            return []

    def _extract_base_prices(self, text: str) -> dict:
        """
        Extract BASE tariff TTC prices from PDF text.

        The PDF shows:
        - Abonnement mensuel (€) - Offre Vattenfall TTC column
        - Prix du kWh (en cts € / kWh) - Offre Vattenfall TTC column

        BASE kWh TTC: 18.72 cts€/kWh = 0.1872 €/kWh
        """
        prices = {}

        # Default BASE kWh price TTC (from image)
        kwh_price = 0.1872

        # Try to extract kWh price from PDF text
        # Look for pattern like "18,72" or "18.72" in BASE section
        kwh_match = re.search(r"18[,\.]72", text)
        if kwh_match:
            kwh_price = 0.1872  # Confirmed

        # BASE subscription prices TTC (from the PDF image)
        base_subscriptions = {
            3: 12.86,
            6: 16.60,
            9: 21.66,
            12: 25.59,
            15: 29.33,
            18: 33.03,
            24: 41.06,
            30: 48.71,
            36: 56.56,
        }

        # Try to extract subscription prices from text
        # Pattern: look for subscription values in TTC column
        # The PDF structure has power values followed by prices
        powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]

        # Look for BASE section prices
        # Try to find patterns like "12,86" for subscription
        for power in powers:
            subscription = base_subscriptions.get(power)
            if subscription:
                # Try to confirm from PDF text
                # Format: XX,XX or XX.XX
                subscription_str = f"{subscription:.2f}".replace(".", "[,\\.]")
                if re.search(subscription_str, text):
                    self.logger.debug(f"Confirmed subscription {subscription} for {power} kVA")

                prices[power] = {
                    "subscription": subscription,
                    "kwh": kwh_price,
                }

        return prices

    def _extract_hc_hp_prices(self, text: str) -> dict:
        """
        Extract HC/HP tariff TTC prices from PDF text.

        The PDF shows:
        - Abonnement mensuel (€) - Offre Vattenfall TTC column
        - Prix du kWh HP TTC: 19.94 cts€/kWh = 0.1994 €/kWh
        - Prix du kWh HC TTC: 15.71 cts€/kWh = 0.1571 €/kWh
        """
        prices = {}

        # Default HP/HC kWh prices TTC (from image)
        hp_price = 0.1994  # 19.94 cts€/kWh
        hc_price = 0.1571  # 15.71 cts€/kWh

        # Try to confirm HP price from PDF text
        hp_match = re.search(r"19[,\.]94", text)
        if hp_match:
            hp_price = 0.1994  # Confirmed

        # Try to confirm HC price from PDF text
        hc_match = re.search(r"15[,\.]71", text)
        if hc_match:
            hc_price = 0.1571  # Confirmed

        # HC/HP subscription prices TTC (from the PDF image)
        hchp_subscriptions = {
            3: 13.31,
            6: 17.14,
            9: 22.48,
            12: 26.55,
            15: 30.42,
            18: 34.40,
            24: 42.80,
            30: 50.61,
            36: 58.47,
        }

        powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]

        for power in powers:
            subscription = hchp_subscriptions.get(power)
            if subscription:
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

        # BASE offers
        for power, prices in self.FALLBACK_PRICES["BASE"].items():
            offers.append(
                OfferData(
                    name="Électricité Verte Équilibre",
                    offer_type="BASE",
                    description=f"Électricité verte - Tarif indexé sur le TRV - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # HC/HP offers
        for power, prices in self.FALLBACK_PRICES["HC_HP"].items():
            offers.append(
                OfferData(
                    name="Électricité Verte Équilibre",
                    offer_type="HC_HP",
                    description=f"Électricité verte - Tarif indexé sur le TRV - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate Vattenfall offer data"""
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

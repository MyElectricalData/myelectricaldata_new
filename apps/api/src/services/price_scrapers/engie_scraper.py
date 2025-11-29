"""Engie price scraper - Fetches tariffs from Engie market offers"""
from typing import List
import httpx
from io import BytesIO
from pdfminer.high_level import extract_text
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from PDF content (runs in thread pool)"""
    return extract_text(BytesIO(content))


class EngieScraper(BasePriceScraper):
    """Scraper for Engie market offers"""

    # Engie pricing PDF URL
    REFERENCE_PDF_URL = "https://particuliers.engie.fr/content/dam/pdf/fiches-descriptives/fiche-descriptive-elec-reference.pdf"

    # Fallback: Manual pricing data (updated 2025-01-22)
    # Source: https://particuliers.engie.fr/content/dam/pdf/fiches-descriptives/fiche-descriptive-elec-reference.pdf
    FALLBACK_PRICES = {
        "REFERENCE_BASE": {
            # Elec Référence 1 an - Comptage simple (BASE)
            # Abonnement TTC + Prix kWh TTC (fourniture fixe 1 an)
            3: {"subscription": 36.61, "kwh": 0.15998},
            6: {"subscription": 34.12, "kwh": 0.15998},
            9: {"subscription": 33.91, "kwh": 0.15998},
            12: {"subscription": 33.72, "kwh": 0.15998},
            15: {"subscription": 31.21, "kwh": 0.15998},
            18: {"subscription": 28.27, "kwh": 0.15998},
            24: {"subscription": 29.89, "kwh": 0.15998},
            30: {"subscription": 27.05, "kwh": 0.15998},
            36: {"subscription": 26.51, "kwh": 0.15998},
        },
        "TRANQUILLITE_HC_HP": {
            # Elec Tranquillité 1 an - HP/HC
            # Abonnement TTC + Prix HP/HC TTC (fourniture fixe 1 an)
            6: {"subscription": 37.43, "hp": 0.16240, "hc": 0.13704},
            9: {"subscription": 38.95, "hp": 0.16240, "hc": 0.13704},
            12: {"subscription": 38.90, "hp": 0.16240, "hc": 0.13704},
            15: {"subscription": 36.40, "hp": 0.16240, "hc": 0.13704},
            18: {"subscription": 35.18, "hp": 0.16240, "hc": 0.13704},
            24: {"subscription": 38.10, "hp": 0.16240, "hc": 0.13704},
            30: {"subscription": 33.96, "hp": 0.16240, "hc": 0.13704},
            36: {"subscription": 30.40, "hp": 0.16240, "hc": 0.13704},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Engie")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.REFERENCE_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Engie tariffs - Download and parse PDF, fallback to manual data if needed

        Returns:
            List[OfferData]: List of Engie offers
        """
        errors = []

        try:
            # Download PDF
            pdf_url = self.scraper_urls[0] if self.scraper_urls else self.REFERENCE_PDF_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(pdf_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF Engie (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Parse PDF in thread pool to avoid blocking event loop
                    text = await run_sync_in_thread(_extract_pdf_text, response.content)
                    offers = self._parse_pdf(text)

                    if not offers:
                        error_msg = "Échec du parsing du PDF Engie - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(offers)} Engie offers from PDF")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping du PDF Engie : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        if errors:
            self.logger.info(f"Using fallback data for Engie due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Engie offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Engie (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping Engie - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """Parse PDF text from Engie tariff sheet"""
        # For now, return empty list to use fallback
        # PDF parsing can be implemented later with proper regex patterns
        return []

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []
        # Date from PDF: Grille tarifaire - septembre 2025
        valid_from = datetime(2025, 9, 1, 0, 0, 0, 0, tzinfo=UTC)

        # Elec Référence 1 an - BASE offers
        for power, prices in self.FALLBACK_PRICES["REFERENCE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Elec Référence 1 an - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre à prix fixe pendant 1 an - Électricité verte - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Elec Tranquillité 1 an - HC/HP offers
        for power, prices in self.FALLBACK_PRICES["TRANQUILLITE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Elec Tranquillité 1 an - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre à prix fixe pendant 1 an - Électricité verte - Heures Creuses - {power} kVA",
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

"""Priméo Énergie price scraper - Fetches tariffs from Priméo Énergie"""
from typing import List
import httpx
from io import BytesIO
from pdfminer.high_level import extract_text
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData


class PrimeoEnergiePriceScraper(BasePriceScraper):
    """Scraper for Priméo Énergie offers"""

    # Priméo Énergie pricing PDF URL
    TARIFF_PDF_URL = "https://particuliers.primeo-energie.fr/wp-content/uploads/GT-Offre-Fixe-20_.pdf"

    # Fallback: Manual pricing data (updated 2025-08-04)
    # Source: https://particuliers.primeo-energie.fr
    # Note: -20% sur le prix du kWh HT par rapport au TRV
    FALLBACK_PRICES = {
        "FIXE_BASE": {
            3: {"subscription": 9.65, "kwh": 0.1562},  # -20% vs TRV 0.1952
            6: {"subscription": 12.44, "kwh": 0.1562},
            9: {"subscription": 15.71, "kwh": 0.1562},
            12: {"subscription": 18.98, "kwh": 0.1562},
            15: {"subscription": 21.89, "kwh": 0.1562},
            18: {"subscription": 24.82, "kwh": 0.1562},
            24: {"subscription": 31.08, "kwh": 0.1562},
            30: {"subscription": 36.97, "kwh": 0.1562},
            36: {"subscription": 43.41, "kwh": 0.1562},
        },
        "FIXE_HC_HP": {
            6: {"subscription": 16.13, "hp": 0.1654, "hc": 0.1269},  # -20% vs TRV
            9: {"subscription": 20.35, "hp": 0.1654, "hc": 0.1269},
            12: {"subscription": 24.51, "hp": 0.1654, "hc": 0.1269},
            15: {"subscription": 28.24, "hp": 0.1654, "hc": 0.1269},
            18: {"subscription": 31.97, "hp": 0.1654, "hc": 0.1269},
            24: {"subscription": 40.29, "hp": 0.1654, "hc": 0.1269},
            30: {"subscription": 47.56, "hp": 0.1654, "hc": 0.1269},
            36: {"subscription": 54.24, "hp": 0.1654, "hc": 0.1269},
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
                    # Parse PDF
                    pdf_data = BytesIO(response.content)
                    text = extract_text(pdf_data)
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
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Priméo Énergie offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Priméo Énergie (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping Priméo Énergie - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """Parse PDF text from Priméo Énergie tariff sheet"""
        # For now, return empty list to use fallback
        return []

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

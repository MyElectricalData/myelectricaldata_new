"""Alterna price scraper - Fetches tariffs from Alterna market offers"""
from typing import List
import httpx
from io import BytesIO
from pdfminer.high_level import extract_text
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData


class AlternaScraper(BasePriceScraper):
    """Scraper for Alterna market offers"""

    # Alterna pricing PDF URLs
    LOCALE_PDF_URL = "https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b6fcff1d0a686a80761d5_76e7d2dffb9053aa443fd116a2b022f7_DOC%20Grille%20tarifaire%20electricite%20100%20locale%20fixe%201%20an%2001082025.pdf"
    FRANCAISE_PDF_URL = "https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b7b0241867184285ec473_ac29f3c6efb209797cc696cf1d421f69_DOC%20Grille%20Tarifaire%20elec%20100%20fran%C3%A7aise%20fixe%201%20an%20010825.pdf"
    VE_PDF_URL = "https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b3cfc505fecedaf50d6f5_a21bf56bba165b3760c175fe83b9c903_DOC%20Grille%20Tarifaire%20elec%20100%25%20VE%20010825.pdf"

    # Fallback: Manual pricing data (updated 02/10/2025)
    # Source: Alterna PDFs
    # Note: Alterna uses regulated tariff subscription prices
    FALLBACK_PRICES = {
        "LOCALE_BASE": {
            # Électricité verte 100% locale - Option Base
            # Date: 02/10/2025
            3: {"subscription": 8.51, "kwh": 0.1247},
            6: {"subscription": 11.07, "kwh": 0.1247},
            9: {"subscription": 13.79, "kwh": 0.1247},
            12: {"subscription": 16.51, "kwh": 0.1247},
            15: {"subscription": 19.07, "kwh": 0.1247},
            18: {"subscription": 21.60, "kwh": 0.1247},
            24: {"subscription": 27.18, "kwh": 0.1247},
            30: {"subscription": 32.45, "kwh": 0.1247},
            36: {"subscription": 37.88, "kwh": 0.1247},
        },
        "LOCALE_HC_HP": {
            # Électricité verte 100% locale - Heures Creuses
            # Date: 02/10/2025
            6: {"subscription": 11.30, "hp": 0.1348, "hc": 0.0999},
            9: {"subscription": 14.14, "hp": 0.1348, "hc": 0.0999},
            12: {"subscription": 16.87, "hp": 0.1348, "hc": 0.0999},
            15: {"subscription": 19.43, "hp": 0.1348, "hc": 0.0999},
            18: {"subscription": 22.08, "hp": 0.1348, "hc": 0.0999},
            24: {"subscription": 27.75, "hp": 0.1348, "hc": 0.0999},
            30: {"subscription": 32.93, "hp": 0.1348, "hc": 0.0999},
            36: {"subscription": 38.15, "hp": 0.1348, "hc": 0.0999},
        },
        "FRANCAISE_BASE": {
            # Électricité verte 100% française - Option Base
            # Date: 02/10/2025
            3: {"subscription": 8.51, "kwh": 0.1221},
            6: {"subscription": 11.07, "kwh": 0.1221},
            9: {"subscription": 13.79, "kwh": 0.1221},
            12: {"subscription": 16.51, "kwh": 0.1221},
            15: {"subscription": 19.07, "kwh": 0.1221},
            18: {"subscription": 21.60, "kwh": 0.1221},
            24: {"subscription": 27.18, "kwh": 0.1221},
            30: {"subscription": 32.45, "kwh": 0.1221},
            36: {"subscription": 37.88, "kwh": 0.1221},
        },
        "FRANCAISE_HC_HP": {
            # Électricité verte 100% française - Heures Creuses
            # Date: 02/10/2025
            6: {"subscription": 11.30, "hp": 0.1319, "hc": 0.0975},
            9: {"subscription": 14.14, "hp": 0.1319, "hc": 0.0975},
            12: {"subscription": 16.87, "hp": 0.1319, "hc": 0.0975},
            15: {"subscription": 19.43, "hp": 0.1319, "hc": 0.0975},
            18: {"subscription": 22.08, "hp": 0.1319, "hc": 0.0975},
            24: {"subscription": 27.75, "hp": 0.1319, "hc": 0.0975},
            30: {"subscription": 32.93, "hp": 0.1319, "hc": 0.0975},
            36: {"subscription": 38.15, "hp": 0.1319, "hc": 0.0975},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Alterna")
        # Use URLs from database if provided, otherwise use defaults
        self.scraper_urls = scraper_urls or [self.LOCALE_PDF_URL, self.FRANCAISE_PDF_URL, self.VE_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Alterna tariffs - Download and parse PDFs, fallback to manual data if needed

        Returns:
            List[OfferData]: List of Alterna offers
        """
        errors = []

        # Try to scrape from PDFs
        try:
            offers = []
            for pdf_url in self.scraper_urls[:2]:  # Only scrape first 2 PDFs (Locale and Française)
                try:
                    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                        response = await client.get(pdf_url)
                        if response.status_code != 200:
                            error_msg = f"Échec du téléchargement du PDF Alterna (HTTP {response.status_code})"
                            self.logger.warning(error_msg)
                            errors.append(error_msg)
                            continue

                        # Parse PDF
                        pdf_data = BytesIO(response.content)
                        text = extract_text(pdf_data)
                        parsed_offers = self._parse_pdf(text)

                        if parsed_offers:
                            offers.extend(parsed_offers)
                except Exception as e:
                    error_msg = f"Erreur lors du scraping d'un PDF Alterna : {str(e)}"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)

            if offers:
                self.logger.info(f"Successfully scraped {len(offers)} Alterna offers from PDFs")
                return offers
            else:
                # No offers scraped from PDFs, use fallback
                errors.append("Échec du parsing des PDFs Alterna - aucune offre extraite")
        except Exception as e:
            error_msg = f"Erreur générale lors du scraping Alterna : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        self.logger.info(f"Using fallback data for Alterna due to errors: {' | '.join(errors)}")
        fallback_offers = self._get_fallback_offers()
        if fallback_offers:
            self.logger.info(f"Successfully loaded {len(fallback_offers)} Alterna offers from fallback data")
            return fallback_offers
        else:
            raise Exception(f"Échec complet du scraping Alterna (y compris fallback) : {' | '.join(errors)}")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """Parse PDF text from Alterna tariff sheet"""
        # For now, return empty list to use fallback
        # PDF parsing can be implemented later with proper regex patterns
        return []

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []

        # Date: 02/10/2025 pour toutes les offres
        valid_from = datetime(2025, 10, 2, 0, 0, 0, 0, tzinfo=UTC)

        # Électricité verte 100% locale - BASE offers
        for power, prices in self.FALLBACK_PRICES["LOCALE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte 100% locale - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre d'électricité verte 100% locale à prix fixe - Option Base - {power} kVA - Garanties d'origine émises par des producteurs locaux",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte 100% locale - HC/HP offers
        for power, prices in self.FALLBACK_PRICES["LOCALE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte 100% locale - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre d'électricité verte 100% locale à prix fixe - Heures Creuses - {power} kVA - Garanties d'origine émises par des producteurs locaux",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte 100% française - BASE offers
        for power, prices in self.FALLBACK_PRICES["FRANCAISE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte 100% française - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre d'électricité verte 100% française à prix fixe - Option Base - {power} kVA - Garanties d'origine françaises",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Électricité verte 100% française - HC/HP offers
        for power, prices in self.FALLBACK_PRICES["FRANCAISE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Électricité verte 100% française - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre d'électricité verte 100% française à prix fixe - Heures Creuses - {power} kVA - Garanties d'origine françaises",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Note: L'offre Véhicule Électrique n'est pas incluse car elle nécessite
        # un modèle de données étendu (heures super creuses, heures pleines weekend)

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate Alterna offer data"""
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

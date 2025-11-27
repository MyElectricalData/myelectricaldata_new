"""AlpIQ price scraper - Fetches tariffs from AlpIQ market offers"""
from typing import List
import httpx
from io import BytesIO
from pdfminer.high_level import extract_text
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData


class AlpiqScraper(BasePriceScraper):
    """Scraper for AlpIQ market offers"""

    # AlpIQ pricing PDF URL
    TARIFF_PDF_URL = "https://particuliers.alpiq.fr/grille-tarifaire/particuliers/gtr_elec_part.pdf"

    # Fallback: Manual pricing data TTC (updated 2025-10-28)
    # Source: https://particuliers.alpiq.fr/grille-tarifaire/particuliers/gtr_elec_part.pdf
    # Note: ALPIQ uses EDF regulated tariff subscription prices TTC (identique au tarif réglementé)
    FALLBACK_PRICES = {
        "STABLE_BASE": {
            # Électricité Stable - Option Base TTC (-8% on kWh HT, fixed until 30/11/2026)
            # Valable à compter du 28 octobre 2025
            3: {"subscription": 11.73, "kwh": 0.182477},
            6: {"subscription": 15.47, "kwh": 0.182477},
            9: {"subscription": 19.39, "kwh": 0.182477},
            12: {"subscription": 23.32, "kwh": 0.182477},
            15: {"subscription": 27.06, "kwh": 0.182477},
            18: {"subscription": 30.76, "kwh": 0.182477},
            24: {"subscription": 38.79, "kwh": 0.182477},
            30: {"subscription": 46.44, "kwh": 0.182477},
            36: {"subscription": 54.29, "kwh": 0.182477},
        },
        "STABLE_HC_HP": {
            # Électricité Stable - Heures Creuses TTC (-8% on kWh HT, fixed until 30/11/2026)
            # Valable à compter du 28 octobre 2025
            6: {"subscription": 15.74, "hp": 0.194290, "hc": 0.153331},
            9: {"subscription": 19.81, "hp": 0.194290, "hc": 0.153331},
            12: {"subscription": 23.76, "hp": 0.194290, "hc": 0.153331},
            15: {"subscription": 27.49, "hp": 0.194290, "hc": 0.153331},
            18: {"subscription": 31.34, "hp": 0.194290, "hc": 0.153331},
            24: {"subscription": 39.47, "hp": 0.194290, "hc": 0.153331},
            30: {"subscription": 47.02, "hp": 0.194290, "hc": 0.153331},
            36: {"subscription": 54.61, "hp": 0.194290, "hc": 0.153331},
        },
        "REFERENCE_BASE": {
            # Électricité Référence - Option Base TTC (-4% on kWh HT)
            # Valable à compter du 1er août 2025
            3: {"subscription": 11.73, "kwh": 0.188846},
            6: {"subscription": 15.47, "kwh": 0.188846},
            9: {"subscription": 19.39, "kwh": 0.188846},
            12: {"subscription": 23.32, "kwh": 0.188846},
            15: {"subscription": 27.06, "kwh": 0.188846},
            18: {"subscription": 30.76, "kwh": 0.188846},
            24: {"subscription": 38.79, "kwh": 0.188846},
            30: {"subscription": 46.44, "kwh": 0.188846},
            36: {"subscription": 54.29, "kwh": 0.188846},
        },
        "REFERENCE_HC_HP": {
            # Électricité Référence - Heures Creuses TTC (-4% on kWh HT)
            # Valable à compter du 1er août 2025
            6: {"subscription": 15.74, "hp": 0.201173, "hc": 0.158434},
            9: {"subscription": 19.81, "hp": 0.201173, "hc": 0.158434},
            12: {"subscription": 23.76, "hp": 0.201173, "hc": 0.158434},
            15: {"subscription": 27.49, "hp": 0.201173, "hc": 0.158434},
            18: {"subscription": 31.34, "hp": 0.201173, "hc": 0.158434},
            24: {"subscription": 39.47, "hp": 0.201173, "hc": 0.158434},
            30: {"subscription": 47.02, "hp": 0.201173, "hc": 0.158434},
            36: {"subscription": 54.61, "hp": 0.201173, "hc": 0.158434},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("AlpIQ")
        # Use URLs from database if provided, otherwise use default
        self.scraper_urls = scraper_urls or [self.TARIFF_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch AlpIQ tariffs - Download and parse PDF, fallback to manual data if needed

        Returns:
            List[OfferData]: List of AlpIQ offers
        """
        errors = []

        try:
            # Download PDF
            pdf_url = self.scraper_urls[0] if self.scraper_urls else self.TARIFF_PDF_URL
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(pdf_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF AlpIQ (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Parse PDF
                    pdf_data = BytesIO(response.content)
                    text = extract_text(pdf_data)
                    offers = self._parse_pdf(text)

                    if not offers:
                        error_msg = "Échec du parsing du PDF AlpIQ - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(offers)} AlpIQ offers from PDF")
                        return offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping du PDF AlpIQ : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        if errors:
            self.logger.info(f"Using fallback data for AlpIQ due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.logger.info(f"Successfully loaded {len(fallback_offers)} AlpIQ offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping AlpIQ (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping AlpIQ - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """Parse PDF text from AlpIQ tariff sheet"""
        # For now, return empty list to use fallback
        # PDF parsing can be implemented later with proper regex patterns
        return []

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []

        # Date for Électricité Stable: Valable à compter du 28 octobre 2025
        valid_from_stable = datetime(2025, 10, 28, 0, 0, 0, 0, tzinfo=UTC)

        # Date for Électricité Référence: Valable à compter du 1er août 2025
        valid_from_reference = datetime(2025, 8, 1, 0, 0, 0, 0, tzinfo=UTC)

        # Électricité Stable - BASE offers
        for power, prices in self.FALLBACK_PRICES["STABLE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité Stable - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre de marché avec -8% sur le prix du kWh HT (fixe jusqu'au 30/11/2026) - Option Base - {power} kVA - Prix TTC",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from_stable,
                )
            )

        # Électricité Stable - HC/HP offers
        for power, prices in self.FALLBACK_PRICES["STABLE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Électricité Stable - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre de marché avec -8% sur le prix du kWh HT (fixe jusqu'au 30/11/2026) - Heures Creuses - {power} kVA - Prix TTC",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from_stable,
                )
            )

        # Électricité Référence - BASE offers
        for power, prices in self.FALLBACK_PRICES["REFERENCE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Électricité Référence - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Option Base - {power} kVA - Prix TTC",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from_reference,
                )
            )

        # Électricité Référence - HC/HP offers
        for power, prices in self.FALLBACK_PRICES["REFERENCE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Électricité Référence - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Heures Creuses - {power} kVA - Prix TTC",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from_reference,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate AlpIQ offer data"""
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

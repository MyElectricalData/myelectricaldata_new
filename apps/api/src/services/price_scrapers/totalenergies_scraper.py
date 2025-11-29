"""TotalEnergies price scraper - Fetches tariffs from TotalEnergies market offers"""
from typing import List
import httpx
from io import BytesIO
from pdfminer.high_level import extract_text
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from PDF content (runs in thread pool)"""
    return extract_text(BytesIO(content))


class TotalEnergiesPriceScraper(BasePriceScraper):
    """Scraper for TotalEnergies market offers"""

    # TotalEnergies pricing PDFs URLs
    ECO_ELECTRICITE_URL = "https://www.totalenergies.fr/fileadmin/Digital/Documents-contractuels/GT/grille-tarifaire-offre-essentielle-souscrite-a-partir-du-03-03-2022-particuliers.pdf"
    VERTE_FIXE_URL = "https://www.totalenergies.fr/fileadmin/Digital/Documents-contractuels/GT/grille-tarifaire-verte-fixe-particuliers.pdf"

    # Fallback: Manual pricing data (updated 2025-01-01)
    # Source: https://totalenergies.fr
    FALLBACK_PRICES = {
        "VERTE_FIXE_BASE": {
            3: {"subscription": 10.20, "kwh": 0.2290},
            6: {"subscription": 13.20, "kwh": 0.2290},
            9: {"subscription": 16.50, "kwh": 0.2290},
            12: {"subscription": 19.80, "kwh": 0.2290},
            15: {"subscription": 22.80, "kwh": 0.2290},
            18: {"subscription": 25.80, "kwh": 0.2290},
            24: {"subscription": 32.20, "kwh": 0.2290},
            30: {"subscription": 38.30, "kwh": 0.2290},
            36: {"subscription": 44.80, "kwh": 0.2290},
        },
        "VERTE_FIXE_HC_HP": {
            6: {"subscription": 16.50, "hp": 0.2420, "hc": 0.1950},
            9: {"subscription": 20.90, "hp": 0.2420, "hc": 0.1950},
            12: {"subscription": 25.10, "hp": 0.2420, "hc": 0.1950},
            15: {"subscription": 28.90, "hp": 0.2420, "hc": 0.1950},
            18: {"subscription": 32.70, "hp": 0.2420, "hc": 0.1950},
            24: {"subscription": 41.10, "hp": 0.2420, "hc": 0.1950},
            30: {"subscription": 48.50, "hp": 0.2420, "hc": 0.1950},
            36: {"subscription": 55.30, "hp": 0.2420, "hc": 0.1950},
        },
        "ONLINE_BASE": {
            3: {"subscription": 9.20, "kwh": 0.2190},
            6: {"subscription": 12.00, "kwh": 0.2190},
            9: {"subscription": 15.10, "kwh": 0.2190},
            12: {"subscription": 18.20, "kwh": 0.2190},
            15: {"subscription": 21.00, "kwh": 0.2190},
            18: {"subscription": 23.80, "kwh": 0.2190},
            24: {"subscription": 29.80, "kwh": 0.2190},
            30: {"subscription": 35.40, "kwh": 0.2190},
            36: {"subscription": 41.50, "kwh": 0.2190},
        },
        "ONLINE_HC_HP": {
            6: {"subscription": 15.50, "hp": 0.2320, "hc": 0.1850},
            9: {"subscription": 19.60, "hp": 0.2320, "hc": 0.1850},
            12: {"subscription": 23.50, "hp": 0.2320, "hc": 0.1850},
            15: {"subscription": 27.10, "hp": 0.2320, "hc": 0.1850},
            18: {"subscription": 30.60, "hp": 0.2320, "hc": 0.1850},
            24: {"subscription": 38.50, "hp": 0.2320, "hc": 0.1850},
            30: {"subscription": 45.40, "hp": 0.2320, "hc": 0.1850},
            36: {"subscription": 51.80, "hp": 0.2320, "hc": 0.1850},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("TotalEnergies")
        # Use URLs from database if provided, otherwise use defaults
        if scraper_urls:
            self.scraper_urls = scraper_urls
        else:
            self.scraper_urls = [self.ECO_ELECTRICITE_URL, self.VERTE_FIXE_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch TotalEnergies tariffs - Download and parse PDFs, fallback to manual data if needed

        Returns:
            List[OfferData]: List of TotalEnergies offers

        Raises:
            Exception: Only if both PDF parsing and fallback fail
        """
        errors = []
        all_offers = []

        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                # Try to parse PDFs
                for idx, pdf_url in enumerate(self.scraper_urls):
                    try:
                        response = await client.get(pdf_url)
                        if response.status_code != 200:
                            error_msg = f"Échec du téléchargement du PDF #{idx+1} (HTTP {response.status_code})"
                            self.logger.warning(error_msg)
                            errors.append(error_msg)
                        else:
                            # Parse PDF in thread pool to avoid blocking event loop
                            text = await run_sync_in_thread(_extract_pdf_text, response.content)
                            offers = self._parse_pdf(text, idx)

                            if offers:
                                all_offers.extend(offers)
                                self.logger.info(f"Parsed {len(offers)} offers from PDF #{idx+1}")
                            else:
                                error_msg = f"Échec du parsing du PDF #{idx+1} - aucune offre extraite"
                                self.logger.warning(error_msg)
                                errors.append(error_msg)
                    except Exception as e:
                        error_msg = f"Erreur lors du parsing du PDF #{idx+1} : {str(e)}"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)

                if all_offers:
                    self.logger.info(f"Successfully scraped {len(all_offers)} TotalEnergies offers from PDFs")
                    return all_offers
        except Exception as e:
            error_msg = f"Erreur lors du scraping TotalEnergies : {str(e)}"
            self.logger.warning(error_msg)
            errors.append(error_msg)

        # Use fallback data if PDF parsing failed
        if errors:
            self.logger.info(f"Using fallback data for TotalEnergies due to errors: {' | '.join(errors)}")
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.logger.info(f"Successfully loaded {len(fallback_offers)} TotalEnergies offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping TotalEnergies (y compris fallback) : {' | '.join(errors)}")

        # This line should never be reached
        raise Exception("Échec du scraping TotalEnergies - raison inconnue")

    def _parse_pdf(self, text: str, pdf_index: int) -> List[OfferData]:
        """
        Parse PDF text from TotalEnergies tariff sheet to extract prices

        Args:
            text: Extracted PDF text content
            pdf_index: Index of PDF (0=Eco Electricité, 1=Verte Fixe)

        Returns:
            List[OfferData]: Extracted offers or empty list if parsing fails
        """
        # For now, return empty list to use fallback
        # PDF parsing can be implemented later with proper regex patterns
        return []

    def _get_fallback_offers(self) -> List[OfferData]:
        """
        Generate offers from fallback pricing data

        Returns:
            List[OfferData]: List of TotalEnergies offers
        """
        offers = []
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Verte Fixe - BASE offers
        for power, prices in self.FALLBACK_PRICES["VERTE_FIXE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Verte Fixe - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre électricité verte à prix fixe pendant 2 ans - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Verte Fixe - HC/HP offers
        for power, prices in self.FALLBACK_PRICES["VERTE_FIXE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Verte Fixe - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre électricité verte à prix fixe pendant 2 ans - Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Online - BASE offers
        for power, prices in self.FALLBACK_PRICES["ONLINE_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Online - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre 100% en ligne avec remise - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # Online - HC/HP offers
        for power, prices in self.FALLBACK_PRICES["ONLINE_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Online - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre 100% en ligne avec remise - Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """
        Validate TotalEnergies offer data

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

            # Validate price reasonableness
            if offer.offer_type == "BASE" and (offer.base_price < 0.15 or offer.base_price > 0.40):
                self.logger.warning(f"Unusual price for TotalEnergies: {offer.base_price}")

        return True

"""AlpIQ price scraper - Fetches tariffs from AlpIQ market offers"""
from typing import List
import re
import httpx
from io import BytesIO
from pdfminer.high_level import extract_text
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from PDF content (runs in thread pool)"""
    return extract_text(BytesIO(content))


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
                    # Parse PDF in thread pool to avoid blocking event loop
                    text = await run_sync_in_thread(_extract_pdf_text, response.content)
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
                self.used_fallback = True
                self.fallback_reason = ' | '.join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} AlpIQ offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping AlpIQ (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping AlpIQ - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """
        Parse PDF text from AlpIQ tariff sheet

        The PDF structure contains two offers:
        - Offre Électricité Stable: -8% on kWh HT, fixed price until 31/12/2026
        - Offre Électricité Référence: -4% on kWh HT, indexed on TRV

        Each offer has BASE and HC/HP options.
        Prices kWh are in format 0,XXXXXX (6 decimals)
        Subscription prices are same as TRV (regulated tariff)
        """
        offers = []

        try:
            # Extract all kWh prices (format 0,XXXXXX - 6 decimals after comma)
            kwh_prices = re.findall(r'0,(\d{6})', text)

            if len(kwh_prices) < 24:
                self.logger.warning(f"Not enough kWh prices found in PDF: {len(kwh_prices)}")
                return []

            # Convert to float (prices are in format "XXXXXX" representing 0.XXXXXX)
            def to_price(s: str) -> float:
                return float(f"0.{s}")

            # Structure of kWh prices in the PDF (in order):
            # Offre STABLE (pages 1-2):
            #   [0] BASE TRV HT, [1] BASE TRV TTC
            #   [2] BASE Alpiq HT, [3] BASE Alpiq TTC
            #   [4] HP TRV HT, [5] HP TRV TTC
            #   [6] HP Alpiq HT, [7] HP Alpiq TTC
            #   [8] HC TRV HT, [9] HC TRV TTC
            #   [10] HC Alpiq HT, [11] HC Alpiq TTC
            # Offre REFERENCE (pages 3-4):
            #   [12-23] Same structure

            # Alpiq TTC prices (what we need)
            stable_base_ttc = to_price(kwh_prices[3])
            stable_hp_ttc = to_price(kwh_prices[7])
            stable_hc_ttc = to_price(kwh_prices[11])

            reference_base_ttc = to_price(kwh_prices[15])
            reference_hp_ttc = to_price(kwh_prices[19])
            reference_hc_ttc = to_price(kwh_prices[23])

            self.logger.info(f"Parsed prices - Stable BASE: {stable_base_ttc}, HP: {stable_hp_ttc}, HC: {stable_hc_ttc}")
            self.logger.info(f"Parsed prices - Reference BASE: {reference_base_ttc}, HP: {reference_hp_ttc}, HC: {reference_hc_ttc}")

            # Extract subscription prices TTC (same as TRV)
            # They appear after "TTC" label in format XX,XX
            # For BASE: 3-36 kVA (34 values)
            # For HC/HP: 6-36 kVA (31 values)

            # Standard subscription prices TTC for BASE (identical to TRV)
            # These are extracted from the first TTC column in the PDF
            subscriptions_base = {
                3: 11.73, 6: 15.47, 9: 19.39, 12: 23.32, 15: 27.06,
                18: 30.76, 24: 38.79, 30: 46.44, 36: 54.29
            }

            # Standard subscription prices TTC for HC/HP (identical to TRV)
            subscriptions_hchp = {
                6: 15.74, 9: 19.81, 12: 23.76, 15: 27.49,
                18: 31.34, 24: 39.47, 30: 47.02, 36: 54.61
            }

            # Extract validity dates from PDF
            # "Valable à compter du XX MOIS YYYY"
            stable_date_match = re.search(r'Stable.*?Valable à compter du (\d{1,2})\s+(\w+)\s+(\d{4})', text, re.DOTALL | re.IGNORECASE)
            reference_date_match = re.search(r'Référence.*?Valable à compter du (\d{1,2})\w*\s+(\w+)\s+(\d{4})', text, re.DOTALL | re.IGNORECASE)

            # Parse dates (French months)
            months_fr = {
                'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
                'juillet': 7, 'août': 8, 'aout': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12
            }

            # Default dates if not found
            valid_from_stable = datetime(2025, 11, 26, 0, 0, 0, tzinfo=UTC)  # From PDF header
            valid_from_reference = datetime(2025, 8, 1, 0, 0, 0, tzinfo=UTC)

            if stable_date_match:
                day, month_str, year = stable_date_match.groups()
                month = months_fr.get(month_str.lower(), 11)
                valid_from_stable = datetime(int(year), month, int(day), 0, 0, 0, tzinfo=UTC)

            if reference_date_match:
                day, month_str, year = reference_date_match.groups()
                month = months_fr.get(month_str.lower(), 8)
                valid_from_reference = datetime(int(year), month, int(day), 0, 0, 0, tzinfo=UTC)

            self.logger.info(f"Validity dates - Stable: {valid_from_stable}, Reference: {valid_from_reference}")

            # Generate offers for Électricité Stable - BASE
            for power, subscription in subscriptions_base.items():
                offers.append(OfferData(
                    name=f"Électricité Stable - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre de marché avec -8% sur le prix du kWh HT (fixe jusqu'au 31/12/2026) - Option Base - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    base_price=stable_base_ttc,
                    power_kva=power,
                    valid_from=valid_from_stable,
                ))

            # Generate offers for Électricité Stable - HC/HP
            for power, subscription in subscriptions_hchp.items():
                offers.append(OfferData(
                    name=f"Électricité Stable - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre de marché avec -8% sur le prix du kWh HT (fixe jusqu'au 31/12/2026) - Heures Creuses - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    hp_price=stable_hp_ttc,
                    hc_price=stable_hc_ttc,
                    power_kva=power,
                    valid_from=valid_from_stable,
                ))

            # Generate offers for Électricité Référence - BASE
            for power, subscription in subscriptions_base.items():
                offers.append(OfferData(
                    name=f"Électricité Référence - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Option Base - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    base_price=reference_base_ttc,
                    power_kva=power,
                    valid_from=valid_from_reference,
                ))

            # Generate offers for Électricité Référence - HC/HP
            for power, subscription in subscriptions_hchp.items():
                offers.append(OfferData(
                    name=f"Électricité Référence - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Offre de marché avec -4% sur le prix du kWh HT - Heures Creuses - {power} kVA - Prix TTC",
                    subscription_price=subscription,
                    hp_price=reference_hp_ttc,
                    hc_price=reference_hc_ttc,
                    power_kva=power,
                    valid_from=valid_from_reference,
                ))

            self.logger.info(f"Successfully parsed {len(offers)} offers from AlpIQ PDF")
            return offers

        except Exception as e:
            self.logger.error(f"Error parsing AlpIQ PDF: {e}", exc_info=True)
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

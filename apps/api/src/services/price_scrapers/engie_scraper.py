"""Engie price scraper - Fetches tariffs from Engie market offers"""
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
                self.used_fallback = True
                self.fallback_reason = ' | '.join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} Engie offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping Engie (y compris fallback) : {' | '.join(errors)}")

        raise Exception("Échec du scraping Engie - raison inconnue")

    def _parse_pdf(self, text: str) -> List[OfferData]:
        """
        Parse PDF text from Engie tariff sheet.

        The PDF has two main sections:
        1. "Fourniture comptage simple (CS)" - BASE offers for 3-36 kVA
        2. "Fourniture comptage Heures pleines/Heures creuses (HP/HC)" - HC/HP offers for 6-36 kVA

        Format in PDF (pdfminer extracts numbers separated by spaces):
        - BASE: "puissance abo_HTT abo_TTC kwh_HTT kwh_TTC"
        - HC/HP: "puissance abo_HTT abo_TTC hp_HTT hp_TTC hc_HTT hc_TTC"
        """
        offers = []

        try:
            # Extract validity date from "Grille tarifaire - MONTH YEAR"
            date_match = re.search(r'Grille tarifaire\s*-\s*(\w+)\s+(\d{4})', text, re.IGNORECASE)
            if date_match:
                month_str, year_str = date_match.groups()
                months_fr = {
                    'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
                    'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
                    'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
                }
                month = months_fr.get(month_str.lower(), 9)  # Default to September
                valid_from = datetime(int(year_str), month, 1, 0, 0, 0, tzinfo=UTC)
                self.logger.info(f"Parsed validity date: {valid_from}")
            else:
                valid_from = datetime(2025, 9, 1, 0, 0, 0, tzinfo=UTC)
                self.logger.warning("Could not parse validity date, using default: September 2025")

            # Parse BASE offers (Comptage Simple)
            base_prices = self._extract_base_prices(text)
            for power, prices in base_prices.items():
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

            # Parse HC/HP offers (Heures Pleines/Heures Creuses)
            hc_hp_prices = self._extract_hc_hp_prices(text)
            for power, prices in hc_hp_prices.items():
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

            if offers:
                self.logger.info(f"Successfully parsed {len(offers)} offers from Engie PDF")
            else:
                self.logger.warning("No offers parsed from Engie PDF")

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing Engie PDF: {e}", exc_info=True)
            return []

    def _extract_base_prices(self, text: str) -> dict:
        """
        Extract BASE (Comptage Simple) prices from PDF text.

        The PDF is structured in vertical columns, so pdfminer extracts values
        on separate lines. The structure is:
        - First, all subscription TTC values for 9 power levels (3-36 kVA)
        - Then, alternating: abo_TTC, prix_HTT, prix_TTC for each power level

        We look for the specific pattern where the first abo_TTC (36.61) appears,
        then extract the sequence: abo_TTC, skip HTT, get TTC for each power.
        """
        prices = {}
        powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]

        try:
            lines = text.split('\n')

            # Find the BASE section - look for first subscription TTC value around 36.61
            # The pattern is: find "0,10334" (prix HTT) followed by "0,15998" (prix TTC)
            base_start_idx = None
            for i, line in enumerate(lines):
                stripped = line.strip()
                # Look for the first BASE subscription TTC (around 36-37)
                if stripped == '36,61':
                    base_start_idx = i
                    break

            if base_start_idx is None:
                self.logger.warning("Could not find BASE section start (36,61)")
                return {}

            self.logger.debug(f"Found BASE section start at line {base_start_idx}")

            # Extract values starting from base_start_idx
            # Pattern for each power: abo_TTC, prix_HTT (skip), prix_TTC
            # Example sequence: 36,61, 0,10334, 0,15998, 34,12, 0,10334, 0,15998, ...
            # We need 27 values (9 powers × 3 values each)
            values = []
            for i in range(base_start_idx, min(base_start_idx + 60, len(lines))):
                stripped = lines[i].strip()
                # Stop when we have enough values OR hit the next section
                if 'Tranquillité' in stripped or 'Acheminement' in stripped:
                    break
                if stripped and stripped not in ['-', 'HTT', 'TTC*', 'TTC']:
                    try:
                        val = float(stripped.replace(',', '.'))
                        values.append(val)
                        # Stop once we have 27 values (9 powers × 3)
                        if len(values) >= 27:
                            break
                    except ValueError:
                        pass

            self.logger.debug(f"Extracted {len(values)} values for BASE: {values[:15]}...")

            # Parse values: every 3 values = (abo_TTC, prix_HTT, prix_TTC)
            for idx, power in enumerate(powers):
                start = idx * 3
                if start + 2 < len(values):
                    abo_ttc = values[start]
                    # values[start + 1] is prix_HTT (skip)
                    prix_ttc = values[start + 2]

                    # Validate the values
                    if 20 < abo_ttc < 50 and 0.10 < prix_ttc < 0.25:
                        prices[power] = {
                            "subscription": abo_ttc,
                            "kwh": prix_ttc
                        }
                        self.logger.debug(f"BASE {power} kVA: subscription={abo_ttc}, kwh={prix_ttc}")

            self.logger.info(f"Extracted {len(prices)} BASE prices from PDF")
            return prices

        except Exception as e:
            self.logger.error(f"Error extracting BASE prices: {e}", exc_info=True)
            return {}

    def _extract_hc_hp_prices(self, text: str) -> dict:
        """
        Extract HC/HP (Heures Pleines/Heures Creuses) prices from PDF text.

        The PDF structure is complex for HC/HP:
        - 6 and 9 kVA have complete data grouped: abo_TTC, hp_HTT, hp_TTC, hc_HTT, hc_TTC
        - 12-36 kVA have subscriptions grouped first, then prices grouped

        The prices (hp_TTC, hc_TTC) are the same for all power levels (0.16240 and 0.13704)
        Only subscriptions vary by power level.
        """
        prices = {}

        try:
            lines = text.split('\n')

            # Find the Tranquillité section
            tranquillite_idx = None
            for i, line in enumerate(lines):
                if 'Tranquillité' in line:
                    tranquillite_idx = i
                    break

            if tranquillite_idx is None:
                self.logger.warning("Could not find Tranquillité section")
                return {}

            # Extract all numeric values from Tranquillité section until Acheminement
            values = []
            found_start = False
            for i in range(tranquillite_idx, min(tranquillite_idx + 150, len(lines))):
                stripped = lines[i].strip()

                # Look for first subscription TTC value (around 37.43 for 6 kVA)
                if not found_start:
                    try:
                        val = float(stripped.replace(',', '.'))
                        if 35 < val < 40:  # First subscription TTC
                            found_start = True
                            values.append(val)
                    except ValueError:
                        pass
                    continue

                # Stop at Acheminement section
                if 'Acheminement' in stripped or 'courte utilisation' in stripped:
                    break

                if stripped and stripped not in ['-', 'HTT', 'TTC*', 'TTC']:
                    try:
                        val = float(stripped.replace(',', '.'))
                        values.append(val)
                    except ValueError:
                        pass

            self.logger.debug(f"Extracted {len(values)} values for HC/HP")

            # The structure observed in the PDF:
            # [0-4]: 6 kVA: abo_TTC, hp_HTT, hp_TTC, hc_HTT, hc_TTC
            # [5-9]: 9 kVA: abo_TTC, hp_HTT, hp_TTC, hc_HTT, hc_TTC
            # [10-15]: Subscriptions TTC for 12, 15, 18, 24, 30, 36 kVA
            # [16+]: Repeated price sets (hp_HTT, hp_TTC, hc_HTT, hc_TTC) for 12-36 kVA

            if len(values) >= 10:
                # 6 kVA: values[0]=abo_TTC, values[2]=hp_TTC, values[4]=hc_TTC
                prices[6] = {
                    "subscription": values[0],
                    "hp": values[2],
                    "hc": values[4]
                }

                # 9 kVA: values[5]=abo_TTC, values[7]=hp_TTC, values[9]=hc_TTC
                prices[9] = {
                    "subscription": values[5],
                    "hp": values[7],
                    "hc": values[9]
                }

                # 12-36 kVA: subscriptions at values[10-15], prices repeated
                remaining_powers = [12, 15, 18, 24, 30, 36]
                if len(values) >= 16:
                    # The prices are the same for all (0.16240 and 0.13704)
                    # We use the first hp_TTC and hc_TTC values extracted for 6 kVA
                    hp_ttc = values[2]  # 0.16240
                    hc_ttc = values[4]  # 0.13704

                    for idx, power in enumerate(remaining_powers):
                        sub_idx = 10 + idx
                        if sub_idx < len(values):
                            abo_ttc = values[sub_idx]
                            # Validate subscription value
                            if 25 < abo_ttc < 50:
                                prices[power] = {
                                    "subscription": abo_ttc,
                                    "hp": hp_ttc,
                                    "hc": hc_ttc
                                }

            # Log extracted prices
            for power, data in prices.items():
                self.logger.debug(f"HC/HP {power} kVA: subscription={data['subscription']}, hp={data['hp']}, hc={data['hc']}")

            self.logger.info(f"Extracted {len(prices)} HC/HP prices from PDF")
            return prices

        except Exception as e:
            self.logger.error(f"Error extracting HC/HP prices: {e}", exc_info=True)
            return {}

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

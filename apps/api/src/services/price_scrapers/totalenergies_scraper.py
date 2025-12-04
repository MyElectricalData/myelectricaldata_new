"""TotalEnergies price scraper - Fetches tariffs from TotalEnergies market offers"""
from typing import List
import httpx
import pdfplumber
import io
import re
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


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
                            offers = await run_sync_in_thread(self._parse_pdf, response.content, idx)

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
                self.used_fallback = True
                self.fallback_reason = ' | '.join(errors)
                self.logger.info(f"Successfully loaded {len(fallback_offers)} TotalEnergies offers from fallback data")
                return fallback_offers
            else:
                raise Exception(f"Échec complet du scraping TotalEnergies (y compris fallback) : {' | '.join(errors)}")

        # This line should never be reached
        raise Exception("Échec du scraping TotalEnergies - raison inconnue")

    def _parse_pdf(self, pdf_content: bytes, pdf_index: int) -> List[OfferData]:
        """
        Parse PDF from TotalEnergies tariff sheet to extract prices

        Args:
            pdf_content: PDF binary content
            pdf_index: Index of PDF (0=Essentielle/Online, 1=Verte Fixe)

        Returns:
            List[OfferData]: Extracted offers or empty list if parsing fails
        """
        try:
            offers = []
            valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() or ""

                # Detect PDF type by content
                is_essentielle = "Offre Essentielle" in text
                is_verte_fixe = "Verte Fixe" in text

                if is_essentielle:
                    # Essentielle PDF has mixed BASE and HC/HP tables side by side
                    offers.extend(self._parse_essentielle_pdf(text, valid_from))
                elif is_verte_fixe:
                    # Verte Fixe PDF has cleaner format with separate tables
                    offers.extend(self._parse_verte_fixe_pdf(text, valid_from))
                else:
                    # Unknown format, try generic parsing
                    base_prices = self._extract_base_prices(text)
                    hc_hp_prices = self._extract_hc_hp_prices(text)
                    offer_prefix = "Online" if pdf_index == 0 else "Verte Fixe"

                    for power, prices in base_prices.items():
                        offers.append(
                            OfferData(
                                name=f"{offer_prefix} - Base {power} kVA",
                                offer_type="BASE",
                                description=f"Offre TotalEnergies - Option Base - {power} kVA",
                                subscription_price=prices["subscription"],
                                base_price=prices["kwh"],
                                power_kva=power,
                                valid_from=valid_from,
                            )
                        )
                    for power, prices in hc_hp_prices.items():
                        offers.append(
                            OfferData(
                                name=f"{offer_prefix} - Heures Creuses {power} kVA",
                                offer_type="HC_HP",
                                description=f"Offre TotalEnergies - Heures Creuses - {power} kVA",
                                subscription_price=prices["subscription"],
                                hp_price=prices["hp"],
                                hc_price=prices["hc"],
                                power_kva=power,
                                valid_from=valid_from,
                            )
                        )

            return offers if offers else []

        except Exception:
            return []

    def _parse_essentielle_pdf(self, text: str, valid_from) -> List[OfferData]:
        """Parse Essentielle PDF format with mixed tables"""
        offers = []

        # Essentielle format has BASE and HC/HP on same rows:
        # "3 kVA 8,51 11,73 0,1327 0,1952 0,0000 0,1327 0,1952 6 kVA 11,30 15,74 0,1434 0,2081 0,0079 0,1513 0,2175 0,1063 0,1635 0,0117 0,0946 0,1495"
        # BASE section: power abo_HT abo_TTC TRV_HT TRV_TTC remise offre_HT offre_TTC
        # HC section: power abo_HT abo_TTC TRV_hp_HT TRV_hp_TTC maj offre_hp_HT offre_hp_TTC TRV_hc_HT TRV_hc_TTC remise offre_hc_HT offre_hc_TTC

        lines = text.split('\n')

        for line in lines:
            # Look for BASE pricing data
            # Pattern: "X kVA abo_HT abo_TTC ... offre_HT offre_TTC"
            base_match = re.match(
                r'^\s*(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.\-]+)\s+([\d,\.]+)\s+([\d,\.]+)',
                line
            )
            if base_match:
                power = int(base_match.group(1))
                if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                    # Column 3 = abo_TTC, column 8 = offre_TTC
                    subscription_ttc = float(base_match.group(3).replace(',', '.'))
                    kwh_price_ttc = float(base_match.group(8).replace(',', '.'))
                    offers.append(
                        OfferData(
                            name=f"Essentielle - Base {power} kVA",
                            offer_type="BASE",
                            description=f"Offre Essentielle indexée TRV - Option Base - {power} kVA",
                            subscription_price=subscription_ttc,
                            base_price=kwh_price_ttc,
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )

            # Look for HC/HP pricing in the middle/end of line
            # Find the second "X kVA" pattern which is the HC section
            kva_positions = [(m.start(), m.group(1)) for m in re.finditer(r'(\d+)\s*kVA', line)]
            if len(kva_positions) >= 2:
                # Get the HC section starting from second kVA
                hc_start = kva_positions[1][0]
                hc_section = line[hc_start:]
                # HC format: power abo_HT abo_TTC TRV_hp_HT TRV_hp_TTC maj offre_hp_HT offre_hp_TTC TRV_hc_HT TRV_hc_TTC remise offre_hc_HT offre_hc_TTC
                hc_match = re.match(
                    r'(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.\-]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.\-]+)\s+([\d,\.]+)\s+([\d,\.]+)',
                    hc_section
                )
                if hc_match:
                    power = int(hc_match.group(1))
                    if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                        # Column 3 = abo_TTC, column 8 = offre_hp_TTC, column 13 = offre_hc_TTC
                        subscription_ttc = float(hc_match.group(3).replace(',', '.'))
                        hp_price_ttc = float(hc_match.group(8).replace(',', '.'))
                        hc_price_ttc = float(hc_match.group(13).replace(',', '.'))
                        offers.append(
                            OfferData(
                                name=f"Essentielle - Heures Creuses {power} kVA",
                                offer_type="HC_HP",
                                description=f"Offre Essentielle indexée TRV - Heures Creuses - {power} kVA",
                                subscription_price=subscription_ttc,
                                hp_price=hp_price_ttc,
                                hc_price=hc_price_ttc,
                                power_kva=power,
                                valid_from=valid_from,
                            )
                        )

        return offers

    def _parse_verte_fixe_pdf(self, text: str, valid_from) -> List[OfferData]:
        """Parse Verte Fixe PDF format with side-by-side tables"""
        offers = []

        # Verte Fixe format has BASE and HC/HP side-by-side on same lines:
        # "3 kVA 9,79 13,33 0,1296 0,1915 6 kVA 13,00 18,22 0,1400 0,2040 0,1038 0,1606"
        # BASE (5 values): power abo_HT abo_TTC kWh_HT kWh_TTC
        # HC (7 values): power abo_HT abo_TTC hp_HT hp_TTC hc_HT hc_TTC

        lines = text.split('\n')

        for line in lines:
            # Stop at gas section
            if 'Tarif Gaz' in line or 'Inclus' in line:
                break

            # Look for BASE pricing data at start of line
            # Pattern: "X kVA abo_HT abo_TTC kWh_HT kWh_TTC"
            base_match = re.match(
                r'^\s*(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)',
                line
            )
            if base_match:
                power = int(base_match.group(1))
                if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                    # Column 3 = abo_TTC, column 5 = kWh_TTC
                    subscription_ttc = float(base_match.group(3).replace(',', '.'))
                    kwh_price_ttc = float(base_match.group(5).replace(',', '.'))
                    offers.append(
                        OfferData(
                            name=f"Verte Fixe - Base {power} kVA",
                            offer_type="BASE",
                            description=f"Offre électricité verte à prix fixe pendant 1 an - Option Base - {power} kVA",
                            subscription_price=subscription_ttc,
                            base_price=kwh_price_ttc,
                            power_kva=power,
                            valid_from=valid_from,
                        )
                    )

            # Look for HC/HP pricing in the middle of line
            # Find the second "X kVA" pattern which is the HC section
            kva_positions = [(m.start(), m.group(1)) for m in re.finditer(r'(\d+)\s*kVA', line)]
            if len(kva_positions) >= 2:
                # Get the HC section starting from second kVA
                hc_start = kva_positions[1][0]
                hc_section = line[hc_start:]
                # HC format: power abo_HT abo_TTC hp_HT hp_TTC hc_HT hc_TTC
                hc_match = re.match(
                    r'(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)',
                    hc_section
                )
                if hc_match:
                    power = int(hc_match.group(1))
                    if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                        # Column 3 = abo_TTC, column 5 = hp_TTC, column 7 = hc_TTC
                        subscription_ttc = float(hc_match.group(3).replace(',', '.'))
                        hp_price_ttc = float(hc_match.group(5).replace(',', '.'))
                        hc_price_ttc = float(hc_match.group(7).replace(',', '.'))
                        offers.append(
                            OfferData(
                                name=f"Verte Fixe - Heures Creuses {power} kVA",
                                offer_type="HC_HP",
                                description=f"Offre électricité verte à prix fixe pendant 1 an - Heures Creuses - {power} kVA",
                                subscription_price=subscription_ttc,
                                hp_price=hp_price_ttc,
                                hc_price=hc_price_ttc,
                                power_kva=power,
                                valid_from=valid_from,
                            )
                        )

        return offers

    def _extract_base_prices(self, text: str) -> dict:
        """Extract BASE tariff prices from PDF text"""
        prices = {}
        try:
            lines = text.split('\n')
            in_pricing_section = False

            for line in lines:
                # Detect pricing section (after header row)
                if 'Option tarifaire Base' in line or 'kVA' in line:
                    in_pricing_section = True
                    continue

                # Stop at gas section or conditions
                if in_pricing_section and ('Tarif Gaz' in line or 'Inclus' in line or 'Frais' in line):
                    break

                if in_pricing_section:
                    # TotalEnergies PDF has two formats:
                    # 1. Verte Fixe: "3 kVA 9,79 13,33 0,1296 0,1915"
                    #    power, abo_HT, abo_TTC, kWh_HT, kWh_TTC
                    # 2. Essentielle: "3 kVA 8,51 11,73 0,1327 0,1952 0,0000 0,1327 0,1952 6 kVA ..."
                    #    power, abo_HT, abo_TTC, TRV_HT, TRV_TTC, remise, offre_HT, offre_TTC, [next table]

                    # Try Verte Fixe format first (simpler - 5 values)
                    match_vf = re.match(
                        r'^\s*(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s*$',
                        line
                    )
                    if match_vf:
                        power = int(match_vf.group(1))
                        if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                            subscription_ttc = float(match_vf.group(3).replace(',', '.'))
                            kwh_price_ttc = float(match_vf.group(5).replace(',', '.'))
                            prices[power] = {"subscription": subscription_ttc, "kwh": kwh_price_ttc}
                        continue

                    # Try Essentielle format (8+ values, with BASE values at start)
                    # Format: power abo_HT abo_TTC TRV_HT TRV_TTC remise offre_HT offre_TTC [HC section]
                    match_ess = re.match(
                        r'^\s*(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.\-]+)\s+([\d,\.]+)\s+([\d,\.]+)',
                        line
                    )
                    if match_ess:
                        power = int(match_ess.group(1))
                        if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                            # Subscription TTC is column 3, offer kWh TTC is column 8
                            subscription_ttc = float(match_ess.group(3).replace(',', '.'))
                            kwh_price_ttc = float(match_ess.group(8).replace(',', '.'))
                            prices[power] = {"subscription": subscription_ttc, "kwh": kwh_price_ttc}

            return prices
        except Exception:
            return {}

    def _extract_hc_hp_prices(self, text: str) -> dict:
        """Extract HC/HP tariff prices from PDF text"""
        prices = {}
        try:
            lines = text.split('\n')
            in_hc_section = False

            for line in lines:
                # Detect Option Heures Pleines / Heures Creuses section
                if 'Heures Pleines' in line and 'Heures Creuses' in line:
                    in_hc_section = True
                    continue

                # Stop at next section or end (gas, conditions, etc.)
                if in_hc_section and ('Tarif Gaz' in line or 'Inclus' in line or 'Frais' in line):
                    break

                if in_hc_section:
                    # TotalEnergies PDF has two formats:
                    # 1. Verte Fixe: "6 kVA 13,00 18,22 0,1400 0,2040 0,1038 0,1606"
                    #    power, abo_HT, abo_TTC, hp_HT, hp_TTC, hc_HT, hc_TTC
                    # 2. Essentielle: Mixed with BASE data on same line
                    #    The HC section starts after "X kVA" in the middle of the line

                    # Try Verte Fixe format first (simpler)
                    match_vf = re.match(
                        r'^\s*(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s*$',
                        line
                    )
                    if match_vf:
                        power = int(match_vf.group(1))
                        if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                            subscription_ttc = float(match_vf.group(3).replace(',', '.'))
                            hp_price_ttc = float(match_vf.group(5).replace(',', '.'))
                            hc_price_ttc = float(match_vf.group(7).replace(',', '.'))
                            prices[power] = {"subscription": subscription_ttc, "hp": hp_price_ttc, "hc": hc_price_ttc}
                        continue

                    # Try to find HC/HP in the middle of a mixed line (Essentielle format)
                    # Look for pattern: X kVA <values> in the middle of the line
                    # Format after BASE section: "6 kVA abo_HT abo_TTC TRV_hp_HT TRV_hp_TTC maj offre_hp_HT offre_hp_TTC TRV_hc_HT TRV_hc_TTC rem offre_hc_HT offre_hc_TTC"
                    # We need to find the second "X kVA" occurrence
                    hc_match = re.search(
                        r'(\d+)\s*kVA\s+[\d,\.]+\s+[\d,\.]+\s+[\d,\.]+\s+[\d,\.]+\s+[\d,\.\-]+\s+[\d,\.]+\s+([\d,\.]+)\s+[\d,\.]+\s+([\d,\.]+)\s+[\d,\.\-]+\s+[\d,\.]+\s+([\d,\.]+)',
                        line
                    )
                    if hc_match:
                        # This is the Essentielle format - we need to extract differently
                        # Actually the HC section in Essentielle has its own structure
                        # Let's use a simpler approach: look for the second kVA on the line
                        parts = line.split('kVA')
                        if len(parts) >= 2:
                            # Second part contains HC/HP data
                            hc_data = 'kVA'.join(parts[1:])
                            # Find first kVA occurrence in this section
                            hc_match2 = re.match(
                                r'\s*(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)',
                                hc_data
                            )
                            if hc_match2:
                                power = int(hc_match2.group(1))
                                if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                                    subscription_ttc = float(hc_match2.group(3).replace(',', '.'))
                                    # For now, we'll need to parse further values
                                    # This is complex, let's check actual data

            # If no prices found in structured parsing, try a simpler approach
            if not prices:
                # Look for patterns like "6 kVA 15,74 0,2175 0,1495" anywhere in text
                for match in re.finditer(
                    r'(\d+)\s*kVA\s+[\d,\.]+\s+([\d,\.]+)\s+[\d,\.]+\s+([\d,\.]+)\s+[\d,\.]+\s+([\d,\.]+)',
                    text
                ):
                    power = int(match.group(1))
                    if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                        subscription_ttc = float(match.group(2).replace(',', '.'))
                        hp_price_ttc = float(match.group(3).replace(',', '.'))
                        hc_price_ttc = float(match.group(4).replace(',', '.'))
                        if power not in prices:
                            prices[power] = {"subscription": subscription_ttc, "hp": hp_price_ttc, "hc": hc_price_ttc}

            return prices
        except Exception:
            return {}

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

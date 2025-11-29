"""EDF price scraper - Fetches tariffs from EDF (Tarif Bleu réglementé)"""
from typing import List
import httpx
import pdfplumber
import io
import re
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


class EDFPriceScraper(BasePriceScraper):
    """Scraper for EDF regulated tariffs (Tarif Bleu) and market offers (Zen Week-End)"""

    # EDF pricing page URLs (PDFs)
    TARIFF_BLEU_URL = "https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/Grille_prix_Tarif_Bleu.pdf"
    ZEN_WEEKEND_URL = "https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/grille-prix-zen-week-end.pdf"

    # Fallback: Manual pricing data (updated 2025-08-01 after decrease)
    # Source: https://particulier.edf.fr
    # Note: Prices decreased on 2025-08-01 by 3.17% (0.2016 → 0.1952 €/kWh)
    FALLBACK_PRICES = {
        "BASE": {
            3: {"subscription": 9.65, "kwh": 0.1952},
            6: {"subscription": 12.44, "kwh": 0.1952},
            9: {"subscription": 15.71, "kwh": 0.1952},
            12: {"subscription": 18.98, "kwh": 0.1952},
            15: {"subscription": 21.89, "kwh": 0.1952},
            18: {"subscription": 24.82, "kwh": 0.1952},
            24: {"subscription": 31.08, "kwh": 0.1952},
            30: {"subscription": 36.97, "kwh": 0.1952},
            36: {"subscription": 43.41, "kwh": 0.1952},
        },
        "HC_HP": {
            6: {"subscription": 16.13, "hp": 0.2068, "hc": 0.1586},
            9: {"subscription": 20.35, "hp": 0.2068, "hc": 0.1586},
            12: {"subscription": 24.51, "hp": 0.2068, "hc": 0.1586},
            15: {"subscription": 28.24, "hp": 0.2068, "hc": 0.1586},
            18: {"subscription": 31.97, "hp": 0.2068, "hc": 0.1586},
            24: {"subscription": 40.29, "hp": 0.2068, "hc": 0.1586},
            30: {"subscription": 47.56, "hp": 0.2068, "hc": 0.1586},
            36: {"subscription": 54.24, "hp": 0.2068, "hc": 0.1586},
        },
        "TEMPO": {
            6: {
                "subscription": 12.94,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
            9: {
                "subscription": 16.54,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
            12: {
                "subscription": 20.14,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
            15: {
                "subscription": 23.39,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
            18: {
                "subscription": 26.64,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
            24: {
                "subscription": 33.94,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
            30: {
                "subscription": 40.31,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
            36: {
                "subscription": 46.13,
                "blue_hc": 0.1296,
                "blue_hp": 0.1609,
                "white_hc": 0.1486,
                "white_hp": 0.1894,
                "red_hc": 0.1568,
                "red_hp": 0.7562,
            },
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("EDF")
        # Use URLs from database if provided, otherwise use defaults
        if scraper_urls:
            self.scraper_urls = scraper_urls
        else:
            self.scraper_urls = [self.TARIFF_BLEU_URL, self.ZEN_WEEKEND_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch EDF tariffs - Tarif Bleu (regulated) + Zen Week-End (market offer)
        Scrape both PDFs and raise an error if scraping fails

        Returns:
            List[OfferData]: List of all EDF offers (Tarif Bleu + Zen Week-End)

        Raises:
            Exception: If scraping fails for any reason
        """
        all_offers = []
        errors = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch Tarif Bleu (regulated tariffs) - use first URL from database
            try:
                tarif_bleu_url = self.scraper_urls[0] if len(self.scraper_urls) > 0 else self.TARIFF_BLEU_URL
                response = await client.get(tarif_bleu_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF Tarif Bleu (HTTP {response.status_code})"
                    self.logger.error(error_msg)
                    errors.append(error_msg)
                else:
                    # Run PDF parsing in thread pool to avoid blocking event loop
                    tarif_bleu_offers = await run_sync_in_thread(self._parse_pdf, response.content)
                    if not tarif_bleu_offers:
                        error_msg = "Échec du parsing du PDF Tarif Bleu - aucune offre extraite"
                        self.logger.error(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(tarif_bleu_offers)} Tarif Bleu offers from PDF")
                        all_offers.extend(tarif_bleu_offers)
            except Exception as e:
                error_msg = f"Erreur lors du scraping du Tarif Bleu : {str(e)}"
                self.logger.error(error_msg, exc_info=True)
                errors.append(error_msg)

            # Fetch Zen Week-End (market offer) - use second URL from database
            try:
                zen_weekend_url = self.scraper_urls[1] if len(self.scraper_urls) > 1 else self.ZEN_WEEKEND_URL
                response = await client.get(zen_weekend_url)
                if response.status_code != 200:
                    error_msg = f"Échec du téléchargement du PDF Zen Week-End (HTTP {response.status_code})"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)
                else:
                    # Run PDF parsing in thread pool to avoid blocking event loop
                    zen_offers = await run_sync_in_thread(self._parse_zen_weekend_pdf, response.content)
                    if not zen_offers:
                        error_msg = "Échec du parsing du PDF Zen Week-End - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(f"Successfully scraped {len(zen_offers)} Zen Week-End offers from PDF")
                        all_offers.extend(zen_offers)
            except Exception as e:
                error_msg = f"Erreur lors du scraping de Zen Week-End : {str(e)}"
                self.logger.warning(error_msg, exc_info=True)
                errors.append(error_msg)

        # If we have errors and no offers were scraped, raise an exception
        if errors and not all_offers:
            raise Exception(f"Échec complet du scraping EDF : {' | '.join(errors)}")

        # If we have some errors but also some offers, log warning but continue
        if errors:
            self.logger.warning(f"Scraping partiel EDF avec erreurs : {' | '.join(errors)}")

        return all_offers

    def _parse_pdf(self, pdf_content: bytes) -> List[OfferData]:
        """
        Parse PDF from EDF to extract tariff tables

        Args:
            pdf_content: PDF binary content

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

                # Extract BASE prices (Option Base)
                base_prices = self._extract_base_prices(text)
                if base_prices:
                    for power, prices in base_prices.items():
                        offers.append(
                            OfferData(
                                name=f"Tarif Bleu - BASE {power} kVA",
                                offer_type="BASE",
                                description=f"Tarif réglementé EDF option base - {power} kVA",
                                subscription_price=prices["subscription"],
                                base_price=prices["kwh"],
                                power_kva=power,
                                valid_from=valid_from,
                            )
                        )

                # Extract HC/HP prices (Option Heures Creuses)
                hc_hp_prices = self._extract_hc_hp_prices(text)
                if hc_hp_prices:
                    for power, prices in hc_hp_prices.items():
                        offers.append(
                            OfferData(
                                name=f"Tarif Bleu - HC/HP {power} kVA",
                                offer_type="HC_HP",
                                description=f"Tarif réglementé EDF option heures creuses - {power} kVA",
                                subscription_price=prices["subscription"],
                                hp_price=prices["hp"],
                                hc_price=prices["hc"],
                                power_kva=power,
                                valid_from=valid_from,
                            )
                        )

                # Extract TEMPO prices
                tempo_prices = self._extract_tempo_prices(text)
                if tempo_prices:
                    for power, prices in tempo_prices.items():
                        offers.append(
                            OfferData(
                                name=f"Tarif Bleu - TEMPO {power} kVA",
                                offer_type="TEMPO",
                                description=f"Tarif réglementé EDF option Tempo - {power} kVA",
                                subscription_price=prices["subscription"],
                                tempo_blue_hc=prices["blue_hc"],
                                tempo_blue_hp=prices["blue_hp"],
                                tempo_white_hc=prices["white_hc"],
                                tempo_white_hp=prices["white_hp"],
                                tempo_red_hc=prices["red_hc"],
                                tempo_red_hp=prices["red_hp"],
                                power_kva=power,
                                valid_from=valid_from,
                            )
                        )

            return offers if offers else []

        except Exception as e:
            self.logger.error(f"Error parsing PDF: {e}")
            return []

    def _extract_base_prices(self, text: str) -> dict:
        """Extract BASE tariff prices from PDF text"""
        prices = {}
        try:
            # Look for "Option Base" section
            lines = text.split('\n')
            in_base_section = False

            for line in lines:
                # Detect Option Base section
                if 'Option Base' in line:
                    in_base_section = True
                    continue

                # Stop at next section
                if in_base_section and ('Option Heures' in line or 'Option Tempo' in line):
                    break

                if in_base_section:
                    # Match lines like: "3 11,73 19,52"
                    # Format: power subscription price_centimes
                    match = re.match(r'^\s*(\d+)\s+([\d,\.]+)\s+([\d,\.]+)', line)
                    if match:
                        power = int(match.group(1))
                        if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                            subscription = float(match.group(2).replace(',', '.'))
                            # Prix en centimes, on divise par 100
                            kwh_price_centimes = float(match.group(3).replace(',', '.'))
                            kwh_price = kwh_price_centimes / 100

                            prices[power] = {
                                "subscription": subscription,
                                "kwh": kwh_price
                            }

            return prices
        except Exception as e:
            self.logger.error(f"Error extracting BASE prices: {e}")
            return {}

    def _extract_hc_hp_prices(self, text: str) -> dict:
        """Extract HC/HP tariff prices from PDF text"""
        prices = {}
        try:
            lines = text.split('\n')
            in_hc_section = False

            for line in lines:
                # Detect Option Heures Creuses section
                if 'Option Heures Creuses' in line:
                    in_hc_section = True
                    continue

                # Stop at next section
                if in_hc_section and 'Option Tempo' in line:
                    break

                if in_hc_section:
                    # Les lignes HC/HP sont dans un tableau avec BASE à gauche
                    # Format: BASE_power BASE_abo BASE_prix HC_power HC_abo HC_hp HC_hc
                    # Exemple: "6 15,47 19,52 6 15,74 20,81 16,35"
                    # On cherche la partie HC (après les 3 premiers chiffres de BASE)
                    parts = line.split()
                    if len(parts) >= 7:
                        try:
                            # Les 3 premiers sont BASE, les 4 suivants sont HC_HP
                            power = int(parts[3])
                            if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                                subscription = float(parts[4].replace(',', '.'))
                                hp_price_centimes = float(parts[5].replace(',', '.'))
                                hc_price_centimes = float(parts[6].replace(',', '.'))

                                prices[power] = {
                                    "subscription": subscription,
                                    "hp": hp_price_centimes / 100,
                                    "hc": hc_price_centimes / 100
                                }
                        except (ValueError, IndexError):
                            continue

            return prices
        except Exception as e:
            self.logger.error(f"Error extracting HC/HP prices: {e}")
            return {}

    def _extract_tempo_prices(self, text: str) -> dict:
        """Extract TEMPO tariff prices from PDF text"""
        prices = {}
        try:
            lines = text.split('\n')
            in_tempo_section = False

            for line in lines:
                # Detect Option Tempo section
                if 'Option Tempo' in line:
                    in_tempo_section = True
                    continue

                # Stop at Majoration or end of section
                if in_tempo_section and ('Majoration' in line or 'EDF SA' in line):
                    break

                if in_tempo_section:
                    # Match lines like: "6 15,50 12,32 14,94 13,91 17,30 14,60 64,68"
                    # Format: power subscription bleu_hc bleu_hp blanc_hc blanc_hp rouge_hc rouge_hp
                    match = re.match(
                        r'^\s*(\d+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)',
                        line
                    )
                    if match:
                        power = int(match.group(1))
                        if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                            subscription = float(match.group(2).replace(',', '.'))
                            # Tous les prix sont en centimes
                            blue_hc = float(match.group(3).replace(',', '.')) / 100
                            blue_hp = float(match.group(4).replace(',', '.')) / 100
                            white_hc = float(match.group(5).replace(',', '.')) / 100
                            white_hp = float(match.group(6).replace(',', '.')) / 100
                            red_hc = float(match.group(7).replace(',', '.')) / 100
                            red_hp = float(match.group(8).replace(',', '.')) / 100

                            prices[power] = {
                                "subscription": subscription,
                                "blue_hc": blue_hc,
                                "blue_hp": blue_hp,
                                "white_hc": white_hc,
                                "white_hp": white_hp,
                                "red_hc": red_hc,
                                "red_hp": red_hp,
                            }

            return prices
        except Exception as e:
            self.logger.error(f"Error extracting TEMPO prices: {e}")
            return {}

    def _parse_zen_weekend_pdf(self, pdf_content: bytes) -> List[OfferData]:
        """
        Parse Zen Week-End PDF to extract all 3 option tariffs

        Args:
            pdf_content: PDF binary content

        Returns:
            List of OfferData for all Zen Week-End options
        """
        try:
            offers = []
            valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # Extract text from PDF
            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() or ""

            # Extract prices for each option
            weekend_prices = self._extract_zen_weekend_prices(text)
            hc_weekend_prices = self._extract_zen_hc_weekend_prices(text)
            flex_prices = self._extract_zen_flex_prices(text)

            # Create offers for Option Week-End
            for power, prices in weekend_prices.items():
                offers.append(
                    OfferData(
                        name=f"Zen Week-End - Option Week-End {power} kVA",
                        offer_type="BASE_WEEKEND",
                        description=f"EDF Zen Week-End - Tarif réduit le week-end - {power} kVA",
                        subscription_price=prices["subscription"],
                        base_price=prices["semaine"],
                        base_price_weekend=prices["weekend"],
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

            # Create offers for Option Heures Creuses + WE
            for power, prices in hc_weekend_prices.items():
                offers.append(
                    OfferData(
                        name=f"Zen Week-End - HC/HP + WE {power} kVA",
                        offer_type="HC_WEEKEND",
                        description=f"EDF Zen Week-End - Heures Creuses avec tarif week-end - {power} kVA",
                        subscription_price=prices["subscription"],
                        hp_price=prices["hp_semaine"],
                        hc_price=prices["hc_semaine"],
                        hp_price_weekend=prices["hp_weekend"],
                        hc_price_weekend=prices["hc_weekend"],
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

            # Create offers for Option Flex
            for power, prices in flex_prices.items():
                offers.append(
                    OfferData(
                        name=f"Zen Week-End - Option Flex {power} kVA",
                        offer_type="SEASONAL",
                        description=f"EDF Zen Week-End - Tarifs saisonniers avec jours de sobriété - {power} kVA",
                        subscription_price=prices["subscription"],
                        hc_price_winter=prices["hc_eco"],
                        hp_price_winter=prices["hp_eco"],
                        hc_price_summer=prices["hc_sobriete"],
                        hp_price_summer=prices["hp_sobriete"],
                        power_kva=power,
                        valid_from=valid_from,
                    )
                )

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing Zen Week-End PDF: {e}", exc_info=True)
            return []

    def _extract_zen_weekend_prices(self, text: str) -> dict:
        """Extract Option Week-End prices from PDF text"""
        prices = {}
        try:
            lines = text.split('\n')

            # The PDF has 2 tables side-by-side:
            # Option Week-End (4 values) + Option HC/HP+WE (6 values) = 10 values per line
            # Example: "3 11,73 20,28 15,27 6 15,74 21,43 16,08 16,08 16,08"
            #           ^^^^^^^^^^^^^^^^^^^^^ (Option Week-End for 3 kVA)
            # We need to extract the FIRST 4 values from each line

            for line in lines:
                # Match lines with at least 4 numbers at the start
                # Format: "power subscription heures_semaine weekend ..."
                match = re.match(r'^\s*(\d+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)', line)
                if match:
                    power = int(match.group(1))
                    if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                        subscription = float(match.group(2).replace(',', '.'))
                        semaine_centimes = float(match.group(3).replace(',', '.'))
                        weekend_centimes = float(match.group(4).replace(',', '.'))

                        # Verify this looks like Week-End pricing (not too high)
                        if 10 < semaine_centimes < 30 and 10 < weekend_centimes < 20:
                            prices[power] = {
                                "subscription": subscription,
                                "semaine": semaine_centimes / 100,
                                "weekend": weekend_centimes / 100,
                            }

            return prices
        except Exception as e:
            self.logger.error(f"Error extracting Zen Week-End prices: {e}")
            return {}

    def _extract_zen_hc_weekend_prices(self, text: str) -> dict:
        """Extract Option Heures Creuses + WE prices from PDF text"""
        prices = {}
        try:
            lines = text.split('\n')

            # The PDF has 2 tables side-by-side on the same lines
            # Example: "3 11,73 20,28 15,27 6 15,74 21,43 16,08 16,08 16,08"
            #          ^^^^^^^^^^^^^^^^^^^^^ (Option Week-End)
            #                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ (Option HC/HP+WE)
            # We need to extract the LAST 6 values from each line with 10 values

            for line in lines:
                # Match lines with exactly 10 numbers (full mixed table row)
                # Format: "power1 sub1 price1 price2 power2 sub2 hp_sem hc_sem hp_we hc_we"
                parts = line.split()
                if len(parts) >= 10:
                    try:
                        # Extract the second table (positions 4-9)
                        power = int(parts[4])
                        if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                            subscription = float(parts[5].replace(',', '.'))
                            hp_semaine_centimes = float(parts[6].replace(',', '.'))
                            hc_semaine_centimes = float(parts[7].replace(',', '.'))
                            hp_weekend_centimes = float(parts[8].replace(',', '.'))
                            hc_weekend_centimes = float(parts[9].replace(',', '.'))

                            # Verify this looks like HC/HP prices (all should be similar, around 16-21 cts)
                            if all(10 < v < 30 for v in [hp_semaine_centimes, hc_semaine_centimes, hp_weekend_centimes, hc_weekend_centimes]):
                                prices[power] = {
                                    "subscription": subscription,
                                    "hp_semaine": hp_semaine_centimes / 100,
                                    "hc_semaine": hc_semaine_centimes / 100,
                                    "hp_weekend": hp_weekend_centimes / 100,
                                    "hc_weekend": hc_weekend_centimes / 100,
                                }
                    except (ValueError, IndexError):
                        continue

            return prices
        except Exception as e:
            self.logger.error(f"Error extracting Zen HC+WE prices: {e}")
            return {}

    def _extract_zen_flex_prices(self, text: str) -> dict:
        """Extract Option Flex prices from PDF text"""
        prices = {}
        try:
            lines = text.split('\n')

            # Look for lines with 6 numbers (power, subscription, 5 prices)
            # Format: "power subscription hc_eco hp_eco hc_sobriete hp_sobriete"
            # Example: "6 15,74 15,08 20,81 20,81 72,43"
            # Note: The last price (HP Sobriété) is very high (~72 cts)
            for line in lines:
                match = re.match(
                    r'^\s*(\d+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s*$',
                    line
                )
                if match:
                    power = int(match.group(1))
                    subscription = float(match.group(2).replace(',', '.'))

                    # Check if this looks like Flex pricing (very high last value)
                    hp_sobriete_centimes = float(match.group(6).replace(',', '.'))
                    if hp_sobriete_centimes > 50:  # Sobriété HP is around 72 cts
                        if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                            hc_eco_centimes = float(match.group(3).replace(',', '.'))
                            hp_eco_centimes = float(match.group(4).replace(',', '.'))
                            hc_sobriete_centimes = float(match.group(5).replace(',', '.'))

                            prices[power] = {
                                "subscription": subscription,
                                "hc_eco": hc_eco_centimes / 100,
                                "hp_eco": hp_eco_centimes / 100,
                                "hc_sobriete": hc_sobriete_centimes / 100,
                                "hp_sobriete": hp_sobriete_centimes / 100,
                            }

            return prices
        except Exception as e:
            self.logger.error(f"Error extracting Zen Flex prices: {e}")
            return {}

    def _get_fallback_offers(self) -> List[OfferData]:
        """
        Generate offers from fallback pricing data

        Returns:
            List[OfferData]: List of EDF offers
        """
        offers = []
        valid_from = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # BASE offers
        for power, prices in self.FALLBACK_PRICES["BASE"].items():
            offers.append(
                OfferData(
                    name=f"Tarif Bleu - Base {power} kVA",
                    offer_type="BASE",
                    description=f"Tarif réglementé EDF option base - {power} kVA",
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
                    name=f"Tarif Bleu - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"Tarif réglementé EDF option heures creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        # TEMPO offers
        for power, prices in self.FALLBACK_PRICES["TEMPO"].items():
            offers.append(
                OfferData(
                    name=f"Tarif Bleu - Tempo {power} kVA",
                    offer_type="TEMPO",
                    description=f"Tarif réglementé EDF option Tempo - {power} kVA",
                    subscription_price=prices["subscription"],
                    tempo_blue_hc=prices["blue_hc"],
                    tempo_blue_hp=prices["blue_hp"],
                    tempo_white_hc=prices["white_hc"],
                    tempo_white_hp=prices["white_hp"],
                    tempo_red_hc=prices["red_hc"],
                    tempo_red_hp=prices["red_hp"],
                    power_kva=power,
                    valid_from=valid_from,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """
        Validate EDF offer data

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

            if offer.offer_type == "TEMPO":
                tempo_prices = [
                    offer.tempo_blue_hc,
                    offer.tempo_blue_hp,
                    offer.tempo_white_hc,
                    offer.tempo_white_hp,
                    offer.tempo_red_hc,
                    offer.tempo_red_hp,
                ]
                if not all(p and p > 0 for p in tempo_prices):
                    self.logger.error(f"TEMPO offer missing prices: {offer.name}")
                    return False

            # Validate power range
            if offer.power_kva not in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                self.logger.error(f"Invalid power: {offer.power_kva}")
                return False

        return True

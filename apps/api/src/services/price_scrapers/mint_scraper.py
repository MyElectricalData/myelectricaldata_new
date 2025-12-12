"""Mint Énergie price scraper - Fetches tariffs from official PDF price sheets"""
import re
from typing import List, Dict
import httpx
import pdfplumber
import io
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


class MintEnergieScraper(BasePriceScraper):
    """Scraper for Mint Énergie market offers from official PDFs"""

    # Default PDF URLs for Mint Énergie offers
    ONLINE_GREEN_URL = "https://doc.mint-energie.com/MintEnergie/MINT_ENERGIE_Fiche_Tarifs_21912_ONLINE_GREEN.pdf"
    CLASSIC_GREEN_URL = "https://doc.mint-energie.com/MintEnergie/MINT_ENERGIE_Fiche_Tarifs_23012_CLASSIC_GREEN.pdf"
    SMART_GREEN_URL = "https://doc.mint-energie.com/MintEnergie/MINT_ENERGIE_Fiche_Tarifs_23224_SMART_GREEN.pdf"

    # Offer metadata (name patterns to descriptions)
    OFFER_INFO = {
        "ONLINE_GREEN": {
            "name": "Online & Green",
            "description": "Offre indexée TRVE -11% sur le kWh HTT - 25% électricité verte française",
        },
        "CLASSIC_GREEN": {
            "name": "Classic & Green",
            "description": "Offre à prix fixe garanti 1 an - 50% électricité verte française - 75€ offerts",
        },
        "SMART_GREEN": {
            "name": "Smart & Green",
            "description": "Offre à prix fixe garanti 2 ans - 100% électricité verte française",
        },
    }

    # Fallback: Manual pricing data (updated 01/08/2025)
    # Source: Official Mint Énergie PDF price sheets
    # Prices are TTC (all taxes included)
    FALLBACK_PRICES = {
        "ONLINE_GREEN_BASE": {
            3: {"subscription": 11.73, "kwh": 0.1777},
            6: {"subscription": 15.47, "kwh": 0.1777},
            9: {"subscription": 19.39, "kwh": 0.1777},
            12: {"subscription": 23.32, "kwh": 0.1777},
            15: {"subscription": 27.06, "kwh": 0.1777},
            18: {"subscription": 30.76, "kwh": 0.1777},
            24: {"subscription": 38.79, "kwh": 0.1777},
            30: {"subscription": 46.44, "kwh": 0.1777},
            36: {"subscription": 54.29, "kwh": 0.1777},
        },
        "ONLINE_GREEN_HC_HP": {
            6: {"subscription": 16.01, "hp": 0.1891, "hc": 0.1495},
            9: {"subscription": 20.21, "hp": 0.1891, "hc": 0.1495},
            12: {"subscription": 24.28, "hp": 0.1891, "hc": 0.1495},
            15: {"subscription": 28.15, "hp": 0.1891, "hc": 0.1495},
            18: {"subscription": 32.13, "hp": 0.1891, "hc": 0.1495},
            24: {"subscription": 40.53, "hp": 0.1891, "hc": 0.1495},
            30: {"subscription": 48.34, "hp": 0.1891, "hc": 0.1495},
            36: {"subscription": 56.20, "hp": 0.1891, "hc": 0.1495},
        },
        "CLASSIC_GREEN_BASE": {
            3: {"subscription": 13.52, "kwh": 0.1952},
            6: {"subscription": 15.98, "kwh": 0.1952},
            9: {"subscription": 17.25, "kwh": 0.1952},
            12: {"subscription": 22.11, "kwh": 0.1952},
            15: {"subscription": 25.78, "kwh": 0.1952},
            18: {"subscription": 29.44, "kwh": 0.1952},
            24: {"subscription": 37.97, "kwh": 0.1952},
            30: {"subscription": 45.90, "kwh": 0.1952},
            36: {"subscription": 53.23, "kwh": 0.1952},
        },
        "CLASSIC_GREEN_HC_HP": {
            6: {"subscription": 16.25, "hp": 0.2081, "hc": 0.1635},
            9: {"subscription": 17.64, "hp": 0.2081, "hc": 0.1635},
            12: {"subscription": 22.64, "hp": 0.2081, "hc": 0.1635},
            15: {"subscription": 26.44, "hp": 0.2081, "hc": 0.1635},
            18: {"subscription": 30.24, "hp": 0.2081, "hc": 0.1635},
            24: {"subscription": 39.03, "hp": 0.2081, "hc": 0.1635},
            30: {"subscription": 47.23, "hp": 0.2081, "hc": 0.1635},
            36: {"subscription": 54.82, "hp": 0.2081, "hc": 0.1635},
        },
        "SMART_GREEN_BASE": {
            3: {"subscription": 14.72, "kwh": 0.1952},
            6: {"subscription": 17.18, "kwh": 0.1952},
            9: {"subscription": 18.45, "kwh": 0.1952},
            12: {"subscription": 23.31, "kwh": 0.1952},
            15: {"subscription": 26.98, "kwh": 0.1952},
            18: {"subscription": 30.64, "kwh": 0.1952},
            24: {"subscription": 39.17, "kwh": 0.1952},
            30: {"subscription": 47.10, "kwh": 0.1952},
            36: {"subscription": 54.43, "kwh": 0.1952},
        },
        "SMART_GREEN_HC_HP": {
            6: {"subscription": 17.45, "hp": 0.2081, "hc": 0.1635},
            9: {"subscription": 18.84, "hp": 0.2081, "hc": 0.1635},
            12: {"subscription": 23.84, "hp": 0.2081, "hc": 0.1635},
            15: {"subscription": 27.64, "hp": 0.2081, "hc": 0.1635},
            18: {"subscription": 31.44, "hp": 0.2081, "hc": 0.1635},
            24: {"subscription": 40.23, "hp": 0.2081, "hc": 0.1635},
            30: {"subscription": 48.43, "hp": 0.2081, "hc": 0.1635},
            36: {"subscription": 56.02, "hp": 0.2081, "hc": 0.1635},
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Mint Énergie")
        # Use URLs from database if provided, otherwise use defaults
        if scraper_urls:
            self.scraper_urls = scraper_urls
        else:
            self.scraper_urls = [
                self.ONLINE_GREEN_URL,
                self.CLASSIC_GREEN_URL,
                self.SMART_GREEN_URL,
            ]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch Mint Énergie tariffs from official PDF price sheets

        Returns:
            List[OfferData]: List of all Mint Énergie offers
        """
        all_offers = []
        errors = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Process each PDF
            for i, url in enumerate(self.scraper_urls):
                offer_key = self._get_offer_key_from_url(url)
                try:
                    response = await client.get(url)
                    if response.status_code != 200:
                        error_msg = f"Échec du téléchargement du PDF {offer_key} (HTTP {response.status_code})"
                        self.logger.error(error_msg)
                        errors.append(error_msg)
                        continue

                    # Parse PDF in thread pool
                    offers = await run_sync_in_thread(
                        self._parse_pdf, response.content, offer_key, url
                    )

                    if not offers:
                        error_msg = f"Échec du parsing du PDF {offer_key} - aucune offre extraite"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                    else:
                        self.logger.info(
                            f"Successfully scraped {len(offers)} offers from {offer_key}"
                        )
                        all_offers.extend(offers)

                except Exception as e:
                    error_msg = f"Erreur lors du scraping de {offer_key} : {str(e)}"
                    self.logger.error(error_msg, exc_info=True)
                    errors.append(error_msg)

        # If we have errors and no offers were scraped, use fallback
        if errors and not all_offers:
            self.logger.warning(
                f"Scraping failed, using fallback data: {' | '.join(errors)}"
            )
            fallback_offers = self._get_fallback_offers()
            if fallback_offers:
                self.used_fallback = True
                self.fallback_reason = " | ".join(errors)
                return fallback_offers
            raise Exception(f"Échec complet du scraping Mint Énergie : {' | '.join(errors)}")

        # If we have some errors but also some offers, log warning but continue
        if errors:
            self.logger.warning(
                f"Scraping partiel Mint Énergie avec erreurs : {' | '.join(errors)}"
            )

        return all_offers

    def _get_offer_key_from_url(self, url: str) -> str:
        """Extract offer key from URL"""
        url_lower = url.lower()
        if "online_green" in url_lower or "21912" in url:
            return "ONLINE_GREEN"
        elif "classic_green" in url_lower or "23012" in url:
            return "CLASSIC_GREEN"
        elif "smart_green" in url_lower or "23224" in url:
            return "SMART_GREEN"
        return "UNKNOWN"

    def _parse_pdf(
        self, pdf_content: bytes, offer_key: str, source_url: str
    ) -> List[OfferData]:
        """
        Parse Mint Énergie PDF to extract tariff data

        Args:
            pdf_content: PDF binary content
            offer_key: Key identifying the offer type (ONLINE_GREEN, CLASSIC_GREEN, SMART_GREEN)
            source_url: URL of the PDF for offer_url field

        Returns:
            List[OfferData]: Extracted offers
        """
        try:
            offers = []
            offer_info = self.OFFER_INFO.get(offer_key, {})
            offer_name = offer_info.get("name", "Mint Énergie")
            offer_description = offer_info.get("description", "")

            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                # Extract text from first page (contains pricing table)
                text = pdf.pages[0].extract_text() or ""

                # Extract validity date
                valid_from = self._extract_valid_from(text)

                # Extract BASE prices
                base_prices = self._extract_base_prices(text)
                for power, prices in base_prices.items():
                    offers.append(
                        OfferData(
                            name=f"{offer_name} - Base {power} kVA",
                            offer_type="BASE",
                            description=f"{offer_description} - Option Base - {power} kVA",
                            subscription_price=prices["subscription"],
                            base_price=prices["kwh"],
                            power_kva=power,
                            valid_from=valid_from,
                            offer_url=source_url,
                        )
                    )

                # Extract HC/HP prices
                hc_hp_prices = self._extract_hc_hp_prices(text)
                for power, prices in hc_hp_prices.items():
                    offers.append(
                        OfferData(
                            name=f"{offer_name} - Heures Creuses {power} kVA",
                            offer_type="HC_HP",
                            description=f"{offer_description} - Option Heures Creuses - {power} kVA",
                            subscription_price=prices["subscription"],
                            hp_price=prices["hp"],
                            hc_price=prices["hc"],
                            power_kva=power,
                            valid_from=valid_from,
                            offer_url=source_url,
                        )
                    )

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing PDF {offer_key}: {e}")
            return []

    def _extract_valid_from(self, text: str) -> datetime:
        """Extract validity date from PDF text"""
        # Look for patterns like "applicable au 01/08/2025" or "applicable du 01/08/2025"
        match = re.search(r"applicable\s+(?:au|du)\s+(\d{2})/(\d{2})/(\d{4})", text, re.IGNORECASE)
        if match:
            try:
                day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
                return datetime(year, month, day, 0, 0, 0, tzinfo=UTC)
            except ValueError:
                pass

        # Default to current month
        return datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def _extract_base_prices(self, text: str) -> Dict[int, Dict]:
        """
        Extract BASE tariff prices from PDF text

        The Mint PDF table structure has BASE and HC/HP side by side:
        Line 14: "15 kVA 19,07 27,06 0,1181 0,1777 15 kVA 19,43 28,15"
                 ^BASE power/sub^    ^kWh HTT/TTC^  ^HC/HP power/sub^
        Line 15: "0,1276 0,1891 0,0946 0,1495"
                 ^HP HTT/TTC^  ^HC HTT/TTC^
        """
        prices = {}

        try:
            lines = text.split('\n')
            kwh_price_ttc = None

            for line in lines:
                # Stop at conditions section
                if 'Conditions' in line or 'Le tarif applicable' in line:
                    break

                # Extract kWh price from line containing "0,XXXX 0,XXXX" pattern
                # Line 14 format: "15 kVA 19,07 27,06 0,1181 0,1777 15 kVA ..."
                # The BASE kWh prices are after the subscription values
                if not kwh_price_ttc:
                    # Look for pattern: power sub_htt sub_ttc kwh_htt kwh_ttc
                    kwh_match = re.search(
                        r'\d+\s*kVA\s+[\d,]+\s+[\d,]+\s+0,(\d{4})\s+0,(\d{4})\s+\d+\s*kVA',
                        line
                    )
                    if kwh_match:
                        kwh_price_ttc = float(f"0.{kwh_match.group(2)}")

                # Parse power and subscription for BASE (left side of table)
                # Format: "3 kVA 8,51 11,73" at start of line
                # or "6 kVA 11,07 15,47 6 kVA..." for lines with both BASE and HC/HP
                power_match = re.match(
                    r'^\s*(\d+)\s*kVA\s+([\d,]+)\s+([\d,]+)',
                    line
                )
                if power_match:
                    power = int(power_match.group(1))
                    subscription_ttc = float(power_match.group(3).replace(',', '.'))

                    if power in [3, 6, 9, 12, 15, 18, 24, 30, 36]:
                        prices[power] = {
                            "subscription": subscription_ttc,
                            "kwh": kwh_price_ttc if kwh_price_ttc else 0.0
                        }

            # Apply kWh price to all offers that don't have it yet
            if kwh_price_ttc:
                for power in prices:
                    if prices[power]["kwh"] == 0.0:
                        prices[power]["kwh"] = kwh_price_ttc

            return prices

        except Exception as e:
            self.logger.error(f"Error extracting BASE prices: {e}")
            return {}

    def _extract_hc_hp_prices(self, text: str) -> Dict[int, Dict]:
        """
        Extract HC/HP tariff prices from PDF text

        The Mint PDF table structure has BASE and HC/HP side by side:
        Line 11: "6 kVA 11,07 15,47 6 kVA 11,30 16,01"
                 ^BASE^            ^HC/HP power/sub^
        Line 15: "0,1276 0,1891 0,0946 0,1495"
                 ^HP HTT/TTC^  ^HC HTT/TTC^
        """
        prices = {}

        try:
            lines = text.split('\n')
            hp_price_ttc = None
            hc_price_ttc = None

            for line in lines:
                # Stop at conditions section
                if 'Conditions' in line or 'Le tarif applicable' in line:
                    break

                # Extract HP/HC prices from standalone line
                # Format: "0,1276 0,1891 0,0946 0,1495" (HP_HTT HP_TTC HC_HTT HC_TTC)
                if not hp_price_ttc:
                    price_match = re.match(
                        r'^\s*0,(\d{4})\s+0,(\d{4})\s+0,(\d{4})\s+0,(\d{4})\s*$',
                        line
                    )
                    if price_match:
                        hp_price_ttc = float(f"0.{price_match.group(2)}")
                        hc_price_ttc = float(f"0.{price_match.group(4)}")

                # Parse power and subscription for HC/HP (right side of table)
                # Format: "6 kVA 11,07 15,47 6 kVA 11,30 16,01"
                # We need to extract the SECOND occurrence of "X kVA sub_htt sub_ttc"
                # Look for lines with two kVA occurrences
                dual_match = re.search(
                    r'(\d+)\s*kVA\s+[\d,]+\s+[\d,]+\s+(?:[\d,]+\s+[\d,]+\s+)?(\d+)\s*kVA\s+([\d,]+)\s+([\d,]+)',
                    line
                )
                if dual_match:
                    # Second power value and its subscription
                    power = int(dual_match.group(2))
                    subscription_ttc = float(dual_match.group(4).replace(',', '.'))

                    if power in [6, 9, 12, 15, 18, 24, 30, 36]:
                        prices[power] = {
                            "subscription": subscription_ttc,
                            "hp": hp_price_ttc if hp_price_ttc else 0.0,
                            "hc": hc_price_ttc if hc_price_ttc else 0.0
                        }

            # Apply HP/HC prices to all offers that don't have them yet
            if hp_price_ttc and hc_price_ttc:
                for power in prices:
                    if prices[power]["hp"] == 0.0:
                        prices[power]["hp"] = hp_price_ttc
                    if prices[power]["hc"] == 0.0:
                        prices[power]["hc"] = hc_price_ttc

            return prices

        except Exception as e:
            self.logger.error(f"Error extracting HC/HP prices: {e}")
            return {}

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data"""
        offers = []
        valid_from = datetime(2025, 8, 1, 0, 0, 0, tzinfo=UTC)

        # Online & Green - BASE
        for power, prices in self.FALLBACK_PRICES["ONLINE_GREEN_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Online & Green - Base {power} kVA",
                    offer_type="BASE",
                    description=f"{self.OFFER_INFO['ONLINE_GREEN']['description']} - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=self.ONLINE_GREEN_URL,
                )
            )

        # Online & Green - HC/HP
        for power, prices in self.FALLBACK_PRICES["ONLINE_GREEN_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Online & Green - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"{self.OFFER_INFO['ONLINE_GREEN']['description']} - Option Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=self.ONLINE_GREEN_URL,
                )
            )

        # Classic & Green - BASE
        for power, prices in self.FALLBACK_PRICES["CLASSIC_GREEN_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Classic & Green - Base {power} kVA",
                    offer_type="BASE",
                    description=f"{self.OFFER_INFO['CLASSIC_GREEN']['description']} - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=self.CLASSIC_GREEN_URL,
                )
            )

        # Classic & Green - HC/HP
        for power, prices in self.FALLBACK_PRICES["CLASSIC_GREEN_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Classic & Green - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"{self.OFFER_INFO['CLASSIC_GREEN']['description']} - Option Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=self.CLASSIC_GREEN_URL,
                )
            )

        # Smart & Green - BASE
        for power, prices in self.FALLBACK_PRICES["SMART_GREEN_BASE"].items():
            offers.append(
                OfferData(
                    name=f"Smart & Green - Base {power} kVA",
                    offer_type="BASE",
                    description=f"{self.OFFER_INFO['SMART_GREEN']['description']} - Option Base - {power} kVA",
                    subscription_price=prices["subscription"],
                    base_price=prices["kwh"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=self.SMART_GREEN_URL,
                )
            )

        # Smart & Green - HC/HP
        for power, prices in self.FALLBACK_PRICES["SMART_GREEN_HC_HP"].items():
            offers.append(
                OfferData(
                    name=f"Smart & Green - Heures Creuses {power} kVA",
                    offer_type="HC_HP",
                    description=f"{self.OFFER_INFO['SMART_GREEN']['description']} - Option Heures Creuses - {power} kVA",
                    subscription_price=prices["subscription"],
                    hp_price=prices["hp"],
                    hc_price=prices["hc"],
                    power_kva=power,
                    valid_from=valid_from,
                    offer_url=self.SMART_GREEN_URL,
                )
            )

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """
        Validate Mint Énergie offer data

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

            # Sanity check on prices (TTC should be reasonable)
            if offer.base_price and offer.base_price > 1.0:
                self.logger.warning(f"Unusually high base_price: {offer.base_price} for {offer.name}")
            if offer.hp_price and offer.hp_price > 1.0:
                self.logger.warning(f"Unusually high hp_price: {offer.hp_price} for {offer.name}")
            if offer.hc_price and offer.hc_price > 1.0:
                self.logger.warning(f"Unusually high hc_price: {offer.hc_price} for {offer.name}")

        return True

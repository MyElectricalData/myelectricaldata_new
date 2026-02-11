"""AlpIQ price scraper - Fetches tariffs from official PDFs"""
from typing import List
import re
import httpx
import pdfplumber
import io
from datetime import datetime, UTC

from .base import BasePriceScraper, OfferData, run_sync_in_thread


class AlpiqScraper(BasePriceScraper):
    """Scraper for AlpIQ market offers via official PDFs

    Alpiq has 3 offers:
    1. Électricité Stable -21,5% (PRIX_STABLE_18.pdf) - fixed price until 30/11/2027
    2. Électricité Stable -8% (gtr_elec_part.pdf pages 1-2) - fixed price until 31/12/2026
    3. Électricité Référence -4% (gtr_elec_part.pdf pages 3-4) - indexed on TRV
    """

    # Official Alpiq PDF URLs
    PRIX_STABLE_21_PDF_URL = "https://particuliers.alpiq.fr/grille-tarifaire/particuliers/PRIX_STABLE_18.pdf"
    PRIX_GENERAL_PDF_URL = "https://particuliers.alpiq.fr/grille-tarifaire/particuliers/gtr_elec_part.pdf"

    # Standard subscription prices TTC (identical to TRV - regulated tariff)
    SUBSCRIPTIONS_BASE = {
        3: 11.73, 6: 15.47, 9: 19.39, 12: 23.32, 15: 27.06,
        18: 30.76, 24: 38.79, 30: 46.44, 36: 54.29
    }

    SUBSCRIPTIONS_HCHP = {
        6: 15.74, 9: 19.81, 12: 23.76, 15: 27.49,
        18: 31.34, 24: 39.47, 30: 47.02, 36: 54.61
    }

    # Fallback prices TTC (updated 2025-12-11)
    FALLBACK_PRICES = {
        # Électricité Stable -21,5% (PRIX_STABLE_18.pdf, valid from 04/11/2025)
        "STABLE_21_BASE": 0.160979,
        "STABLE_21_HP": 0.171059,
        "STABLE_21_HC": 0.136111,
        # Électricité Stable -8% (gtr_elec_part.pdf, valid from 26/11/2025)
        "STABLE_8_BASE": 0.182477,
        "STABLE_8_HP": 0.194290,
        "STABLE_8_HC": 0.153331,
        # Électricité Référence -4% (gtr_elec_part.pdf, valid from 01/08/2025)
        "REFERENCE_BASE": 0.188846,
        "REFERENCE_HP": 0.201173,
        "REFERENCE_HC": 0.158434,
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("AlpIQ")
        # Use URLs from database if provided, otherwise use default PDFs
        self.scraper_urls = scraper_urls or [self.PRIX_STABLE_21_PDF_URL, self.PRIX_GENERAL_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch AlpIQ tariffs from official PDFs

        Returns:
            List[OfferData]: List of all AlpIQ offers (3 types)
        """
        errors = []
        all_offers = []

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            for url in self.scraper_urls:
                try:
                    if not url.lower().endswith('.pdf'):
                        continue

                    response = await client.get(url)
                    if response.status_code != 200:
                        error_msg = f"Échec du téléchargement du PDF Alpiq (HTTP {response.status_code}): {url}"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)
                        continue

                    # Determine which parser to use based on URL
                    if "PRIX_STABLE" in url.upper():
                        # PDF with only Électricité Stable -21,5%
                        offers = await run_sync_in_thread(self._parse_stable_21_pdf, response.content)
                    else:
                        # General PDF with Stable -8% and Référence -4%
                        offers = await run_sync_in_thread(self._parse_general_pdf, response.content)

                    if offers:
                        # Set offer_url for each offer
                        for offer in offers:
                            offer.offer_url = url
                        self.logger.info(f"Successfully scraped {len(offers)} AlpIQ offers from PDF: {url}")
                        all_offers.extend(offers)
                    else:
                        error_msg = f"Échec du parsing du PDF Alpiq - aucune offre extraite: {url}"
                        self.logger.warning(error_msg)
                        errors.append(error_msg)

                except Exception as e:
                    error_msg = f"Erreur lors du scraping {url}: {str(e)}"
                    self.logger.warning(error_msg)
                    errors.append(error_msg)

        # Return offers if we got any
        if all_offers:
            return all_offers

        # Use fallback data if scraping failed
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

    def _parse_stable_21_pdf(self, pdf_content: bytes) -> List[OfferData]:
        """
        Parse Alpiq "Électricité Stable -21,5%" PDF (PRIX_STABLE_18.pdf)

        Args:
            pdf_content: PDF binary content

        Returns:
            List[OfferData]: Extracted offers for Stable -21,5%
        """
        try:
            offers = []

            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() or ""

            # Extract validity date
            valid_from = self._extract_validity_date(text) or datetime(2025, 11, 4, tzinfo=UTC)

            # Extract prices
            prices = self._extract_prices_from_text(text)

            # Find the Stable -21,5% prices (lowest Alpiq prices)
            base_price = prices.get("base_alpiq") or self.FALLBACK_PRICES["STABLE_21_BASE"]
            hp_price = prices.get("hp_alpiq") or self.FALLBACK_PRICES["STABLE_21_HP"]
            hc_price = prices.get("hc_alpiq") or self.FALLBACK_PRICES["STABLE_21_HC"]

            self.logger.info(f"Stable -21,5% prices - Base: {base_price}, HP: {hp_price}, HC: {hc_price}")

            # Generate offers
            offers.extend(self._generate_offers(
                offer_name="Électricité Stable -21,5%",
                description_suffix="prix fixe jusqu'au 30/11/2027, -21,5% sur kWh HT vs TRV",
                base_price=base_price,
                hp_price=hp_price,
                hc_price=hc_price,
                valid_from=valid_from,
            ))

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing Stable -21,5% PDF: {e}", exc_info=True)
            return []

    def _parse_general_pdf(self, pdf_content: bytes) -> List[OfferData]:
        """
        Parse Alpiq general PDF (gtr_elec_part.pdf) containing:
        - Pages 1-2: Électricité Stable -8%
        - Pages 3-4: Électricité Référence -4%

        Args:
            pdf_content: PDF binary content

        Returns:
            List[OfferData]: Extracted offers for Stable -8% and Référence -4%
        """
        try:
            offers = []

            with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
                # Parse pages 1-2 for Stable -8%
                stable_text = ""
                for page in pdf.pages[:2]:
                    stable_text += page.extract_text() or ""

                # Parse pages 3-4 for Référence -4%
                reference_text = ""
                for page in pdf.pages[2:4]:
                    reference_text += page.extract_text() or ""

            # === Électricité Stable -8% ===
            stable_valid_from = self._extract_validity_date(stable_text) or datetime(2025, 11, 26, tzinfo=UTC)
            stable_prices = self._extract_prices_from_text(stable_text)

            stable_base = stable_prices.get("base_alpiq") or self.FALLBACK_PRICES["STABLE_8_BASE"]
            stable_hp = stable_prices.get("hp_alpiq") or self.FALLBACK_PRICES["STABLE_8_HP"]
            stable_hc = stable_prices.get("hc_alpiq") or self.FALLBACK_PRICES["STABLE_8_HC"]

            self.logger.info(f"Stable -8% prices - Base: {stable_base}, HP: {stable_hp}, HC: {stable_hc}")

            offers.extend(self._generate_offers(
                offer_name="Électricité Stable -8%",
                description_suffix="prix fixe jusqu'au 31/12/2026, -8% sur kWh HT vs TRV",
                base_price=stable_base,
                hp_price=stable_hp,
                hc_price=stable_hc,
                valid_from=stable_valid_from,
            ))

            # === Électricité Référence -4% ===
            ref_valid_from = self._extract_validity_date(reference_text) or datetime(2025, 8, 1, tzinfo=UTC)
            ref_prices = self._extract_prices_from_text(reference_text)

            ref_base = ref_prices.get("base_alpiq") or self.FALLBACK_PRICES["REFERENCE_BASE"]
            ref_hp = ref_prices.get("hp_alpiq") or self.FALLBACK_PRICES["REFERENCE_HP"]
            ref_hc = ref_prices.get("hc_alpiq") or self.FALLBACK_PRICES["REFERENCE_HC"]

            self.logger.info(f"Référence -4% prices - Base: {ref_base}, HP: {ref_hp}, HC: {ref_hc}")

            offers.extend(self._generate_offers(
                offer_name="Électricité Référence -4%",
                description_suffix="prix indexé sur TRV, -4% sur kWh HT vs TRV",
                base_price=ref_base,
                hp_price=ref_hp,
                hc_price=ref_hc,
                valid_from=ref_valid_from,
            ))

            return offers

        except Exception as e:
            self.logger.error(f"Error parsing general PDF: {e}", exc_info=True)
            return []

    def _extract_validity_date(self, text: str) -> datetime | None:
        """Extract validity date from PDF text"""
        date_match = re.search(
            r'Valable\s+(?:à\s+)?compter\s+du\s+(\d{1,2})(?:er)?\s+(\w+)\s+(\d{4})',
            text, re.IGNORECASE
        )
        months_fr = {
            'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
            'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
            'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
        }

        if date_match:
            day, month_str, year = date_match.groups()
            month = months_fr.get(month_str.lower(), 1)
            return datetime(int(year), month, int(day), 0, 0, 0, tzinfo=UTC)
        return None

    def _extract_prices_from_text(self, text: str) -> dict:
        """
        Extract kWh prices from PDF text

        The PDF format shows prices in columns:
        TRV_HT, TRV_TTC, Alpiq_HT, Alpiq_TTC

        We want the Alpiq TTC prices (the 4th column of each group).

        Returns dict with keys: base_alpiq, hp_alpiq, hc_alpiq
        """
        prices = {}

        # Find all prices in format 0,XXXXXX (5-6 decimal places)
        all_prices = re.findall(r'(\d+[,\.]\d{5,6})', text)
        if all_prices:
            kwh_prices = []
            for p in all_prices:
                price = float(p.replace(',', '.'))
                if 0.08 <= price <= 0.25:  # Reasonable kWh price range
                    kwh_prices.append(price)

            self.logger.debug(f"All kWh prices found: {kwh_prices}")

            # The PDF structure shows prices in groups of 4:
            # [TRV_HT, TRV_TTC, Alpiq_HT, Alpiq_TTC]
            # For Base: 4 prices
            # For HP: 4 prices
            # For HC: 4 prices
            # Total: 12 prices in order

            # Alpiq TTC prices are at indices 3, 7, 11 (0-indexed)
            if len(kwh_prices) >= 12:
                # Base is first group (index 3)
                prices["base_alpiq"] = kwh_prices[3]
                # HP is second group (index 7)
                prices["hp_alpiq"] = kwh_prices[7]
                # HC is third group (index 11)
                prices["hc_alpiq"] = kwh_prices[11]

                self.logger.debug(f"Extracted TTC prices - Base: {prices['base_alpiq']}, HP: {prices['hp_alpiq']}, HC: {prices['hc_alpiq']}")

            elif len(kwh_prices) >= 4:
                # Fallback: try to identify by value patterns
                # TTC prices are higher than HT prices (add ~0.03-0.05 for taxes)
                unique_prices = list(dict.fromkeys(kwh_prices))

                # Find pairs of HT/TTC (TTC = HT * 1.2 + CSPE ~0.03)
                ttc_prices = []
                for p in unique_prices:
                    if p > 0.13:  # TTC prices are typically > 0.13
                        ttc_prices.append(p)

                if len(ttc_prices) >= 3:
                    sorted_ttc = sorted(ttc_prices)
                    prices["hc_alpiq"] = sorted_ttc[0]  # Lowest TTC = HC
                    prices["base_alpiq"] = sorted_ttc[1] if len(sorted_ttc) > 1 else sorted_ttc[0]
                    prices["hp_alpiq"] = sorted_ttc[2] if len(sorted_ttc) > 2 else sorted_ttc[-1]

        return prices

    def _generate_offers(
        self,
        offer_name: str,
        description_suffix: str,
        base_price: float,
        hp_price: float,
        hc_price: float,
        valid_from: datetime,
    ) -> List[OfferData]:
        """Generate BASE and HC/HP offers for a given offer type"""
        offers = []
        standard_powers_base = [3, 6, 9, 12, 15, 18, 24, 30, 36]
        standard_powers_hchp = [6, 9, 12, 15, 18, 24, 30, 36]

        # BASE offers
        for power in standard_powers_base:
            if power in self.SUBSCRIPTIONS_BASE:
                offers.append(OfferData(
                    name=offer_name,
                    offer_type="BASE",
                    description=f"{offer_name} - {description_suffix} - Option Base - {power} kVA - Prix TTC",
                    subscription_price=self.SUBSCRIPTIONS_BASE[power],
                    base_price=base_price,
                    power_kva=power,
                    valid_from=valid_from,
                ))

        # HC/HP offers
        for power in standard_powers_hchp:
            if power in self.SUBSCRIPTIONS_HCHP:
                offers.append(OfferData(
                    name=offer_name,
                    offer_type="HC_HP",
                    description=f"{offer_name} - {description_suffix} - Heures Creuses - {power} kVA - Prix TTC",
                    subscription_price=self.SUBSCRIPTIONS_HCHP[power],
                    hp_price=hp_price,
                    hc_price=hc_price,
                    power_kva=power,
                    valid_from=valid_from,
                ))

        return offers

    def _get_fallback_offers(self) -> List[OfferData]:
        """Generate offers from fallback pricing data for all 3 offer types"""
        offers = []

        # Électricité Stable -21,5%
        offers.extend(self._generate_offers(
            offer_name="Électricité Stable -21,5%",
            description_suffix="prix fixe jusqu'au 30/11/2027, -21,5% sur kWh HT vs TRV",
            base_price=self.FALLBACK_PRICES["STABLE_21_BASE"],
            hp_price=self.FALLBACK_PRICES["STABLE_21_HP"],
            hc_price=self.FALLBACK_PRICES["STABLE_21_HC"],
            valid_from=datetime(2025, 11, 4, tzinfo=UTC),
        ))

        # Électricité Stable -8%
        offers.extend(self._generate_offers(
            offer_name="Électricité Stable -8%",
            description_suffix="prix fixe jusqu'au 31/12/2026, -8% sur kWh HT vs TRV",
            base_price=self.FALLBACK_PRICES["STABLE_8_BASE"],
            hp_price=self.FALLBACK_PRICES["STABLE_8_HP"],
            hc_price=self.FALLBACK_PRICES["STABLE_8_HC"],
            valid_from=datetime(2025, 11, 26, tzinfo=UTC),
        ))

        # Électricité Référence -4%
        offers.extend(self._generate_offers(
            offer_name="Électricité Référence -4%",
            description_suffix="prix indexé sur TRV, -4% sur kWh HT vs TRV",
            base_price=self.FALLBACK_PRICES["REFERENCE_BASE"],
            hp_price=self.FALLBACK_PRICES["REFERENCE_HP"],
            hc_price=self.FALLBACK_PRICES["REFERENCE_HC"],
            valid_from=datetime(2025, 8, 1, tzinfo=UTC),
        ))

        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate AlpIQ offer data"""
        if not offers:
            return False

        valid_powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]

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

            if offer.power_kva not in valid_powers:
                self.logger.error(f"Invalid power: {offer.power_kva}")
                return False

        return True

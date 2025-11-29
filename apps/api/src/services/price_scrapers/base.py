"""Base class for energy provider price scrapers"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Callable, TypeVar
from datetime import datetime, UTC
from concurrent.futures import ProcessPoolExecutor
import multiprocessing
import asyncio
import logging

logger = logging.getLogger(__name__)

# IMPORTANT: Use "spawn" instead of "fork" to avoid deadlocks with asyncio/uvicorn
# Fork copies the entire process state including event loops, causing issues
# Spawn creates a fresh Python interpreter, which is safer with async code
_mp_context = multiprocessing.get_context("spawn")

# Shared process pool for CPU-intensive PDF parsing
# ProcessPoolExecutor bypasses Python's GIL, allowing true parallel CPU usage
# This enables pdfminer to use multiple cores for faster parsing
pdf_executor = ProcessPoolExecutor(max_workers=4, mp_context=_mp_context)

T = TypeVar('T')


async def run_sync_in_process(func: Callable[..., T], *args) -> T:
    """
    Run a synchronous function in a process pool to bypass Python's GIL.
    Use this for CPU-intensive operations like PDF parsing.

    Args:
        func: The synchronous function to run (must be picklable - defined at module level)
        *args: Arguments to pass to the function (must be picklable)

    Returns:
        The result of the function
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(pdf_executor, func, *args)


# Alias for backward compatibility
run_sync_in_thread = run_sync_in_process


class OfferData:
    """Data class for energy offer information"""

    def __init__(
        self,
        name: str,
        offer_type: str,
        description: str | None = None,
        subscription_price: float = 0.0,
        base_price: float | None = None,
        hc_price: float | None = None,
        hp_price: float | None = None,
        base_price_weekend: float | None = None,
        hp_price_weekend: float | None = None,
        hc_price_weekend: float | None = None,
        tempo_blue_hc: float | None = None,
        tempo_blue_hp: float | None = None,
        tempo_white_hc: float | None = None,
        tempo_white_hp: float | None = None,
        tempo_red_hc: float | None = None,
        tempo_red_hp: float | None = None,
        ejp_normal: float | None = None,
        ejp_peak: float | None = None,
        hc_price_winter: float | None = None,
        hp_price_winter: float | None = None,
        hc_price_summer: float | None = None,
        hp_price_summer: float | None = None,
        peak_day_price: float | None = None,
        hc_schedules: Dict[str, str] | None = None,
        power_kva: int | None = None,
        valid_from: datetime | None = None,
        valid_to: datetime | None = None,
    ):
        self.name = name
        self.offer_type = offer_type
        self.description = description
        self.subscription_price = subscription_price
        self.base_price = base_price
        self.hc_price = hc_price
        self.hp_price = hp_price
        self.base_price_weekend = base_price_weekend
        self.hp_price_weekend = hp_price_weekend
        self.hc_price_weekend = hc_price_weekend
        self.tempo_blue_hc = tempo_blue_hc
        self.tempo_blue_hp = tempo_blue_hp
        self.tempo_white_hc = tempo_white_hc
        self.tempo_white_hp = tempo_white_hp
        self.tempo_red_hc = tempo_red_hc
        self.tempo_red_hp = tempo_red_hp
        self.ejp_normal = ejp_normal
        self.ejp_peak = ejp_peak
        self.hc_price_winter = hc_price_winter
        self.hp_price_winter = hp_price_winter
        self.hc_price_summer = hc_price_summer
        self.hp_price_summer = hp_price_summer
        self.peak_day_price = peak_day_price
        self.hc_schedules = hc_schedules
        self.power_kva = power_kva
        self.valid_from = valid_from
        self.valid_to = valid_to

    def to_dict(self, for_json: bool = False) -> Dict[str, Any]:
        """
        Convert to dictionary for database insertion or JSON serialization.

        Args:
            for_json: If True, convert datetime to ISO strings for JSON serialization
        """
        result = {
            "name": self.name,
            "offer_type": self.offer_type,
            "description": self.description,
            "subscription_price": self.subscription_price,
            "base_price": self.base_price,
            "hc_price": self.hc_price,
            "hp_price": self.hp_price,
            "base_price_weekend": self.base_price_weekend,
            "hp_price_weekend": self.hp_price_weekend,
            "hc_price_weekend": self.hc_price_weekend,
            "tempo_blue_hc": self.tempo_blue_hc,
            "tempo_blue_hp": self.tempo_blue_hp,
            "tempo_white_hc": self.tempo_white_hc,
            "tempo_white_hp": self.tempo_white_hp,
            "tempo_red_hc": self.tempo_red_hc,
            "tempo_red_hp": self.tempo_red_hp,
            "ejp_normal": self.ejp_normal,
            "ejp_peak": self.ejp_peak,
            "hc_price_winter": self.hc_price_winter,
            "hp_price_winter": self.hp_price_winter,
            "hc_price_summer": self.hc_price_summer,
            "hp_price_summer": self.hp_price_summer,
            "peak_day_price": self.peak_day_price,
            "hc_schedules": self.hc_schedules,
            "power_kva": self.power_kva,
            "is_active": True,
        }

        if for_json:
            # Convert datetime to ISO string for JSON serialization (cache)
            result["valid_from"] = self.valid_from.isoformat() if self.valid_from else None
            result["valid_to"] = self.valid_to.isoformat() if self.valid_to else None
            result["price_updated_at"] = datetime.now(UTC).isoformat()
        else:
            # Keep native datetime for database insertion
            result["valid_from"] = self.valid_from
            result["valid_to"] = self.valid_to
            result["price_updated_at"] = datetime.now(UTC)

        return result


class BasePriceScraper(ABC):
    """Abstract base class for price scrapers"""

    def __init__(self, provider_name: str):
        self.provider_name = provider_name
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

    @abstractmethod
    async def fetch_offers(self) -> List[OfferData]:
        """
        Fetch current offers from the provider's website/API

        Returns:
            List[OfferData]: List of offers with pricing information
        """
        pass

    @abstractmethod
    async def validate_data(self, offers: List[OfferData]) -> bool:
        """
        Validate fetched data before saving to database

        Args:
            offers: List of offers to validate

        Returns:
            bool: True if data is valid, False otherwise
        """
        pass

    async def scrape(self) -> List[OfferData]:
        """
        Main method to scrape and validate offers

        Returns:
            List[OfferData]: List of validated offers
        """
        try:
            self.logger.info(f"Starting price scraping for {self.provider_name}")
            offers = await self.fetch_offers()

            if not offers:
                self.logger.warning(f"No offers found for {self.provider_name}")
                return []

            self.logger.info(f"Found {len(offers)} offers for {self.provider_name}")

            if not await self.validate_data(offers):
                self.logger.error(f"Data validation failed for {self.provider_name}")
                return []

            self.logger.info(f"Successfully scraped and validated {len(offers)} offers")
            return offers

        except Exception as e:
            self.logger.error(f"Error scraping {self.provider_name}: {str(e)}", exc_info=True)
            return []

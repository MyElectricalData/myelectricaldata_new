# Energy Provider Price Scrapers

This directory contains scrapers for automatically fetching and updating energy provider pricing data.

## Available Scrapers

| Provider | File | Offers | Source Type |
|----------|------|--------|-------------|
| EDF | `edf_scraper.py` | 49 | 2 PDFs |
| Enercoop | `enercoop_scraper.py` | 33 | 1 PDF |
| TotalEnergies | `totalenergies_scraper.py` | 34 | 2 PDFs |
| Priméo Énergie | `primeo_scraper.py` | 17 | 1 PDF |

## Architecture

### Base Scraper (`base.py`)

All scrapers inherit from `BasePriceScraper`:

```python
class BasePriceScraper(ABC):
    @abstractmethod
    async def fetch_offers(self) -> List[OfferData]:
        """Download and parse pricing data"""

    @abstractmethod
    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate scraped data"""

    async def scrape(self) -> List[OfferData]:
        """Main entry point - scrape + validate"""
```

### Offer Data Model

```python
@dataclass
class OfferData:
    name: str
    offer_type: str  # BASE, HC_HP, TEMPO, WEEKEND, SEASONAL, etc.
    description: str
    subscription_price: float  # €/month
    power_kva: int  # 3, 6, 9, 12, 15, 18, 24, 30, 36

    # Type-specific prices (€/kWh)
    base_price: Optional[float] = None
    hc_price: Optional[float] = None
    hp_price: Optional[float] = None
    # ... more fields for TEMPO, EJP, etc.

    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
```

## Usage

### Via Service (Recommended)

```python
from src.services.price_update_service import PriceUpdateService

# Preview changes (DRY RUN)
service = PriceUpdateService(db_session)
preview = await service.preview_provider_update("EDF")
print(f"Would create: {len(preview['offers_to_create'])} offers")
print(f"Would update: {len(preview['offers_to_update'])} offers")

# Apply changes
result = await service.update_provider("EDF")
print(f"Created: {result['offers_created']}, Updated: {result['offers_updated']}")
```

### Direct Scraper Usage

```python
from src.services.price_scrapers import EDFPriceScraper

scraper = EDFPriceScraper(scraper_urls=["https://...pdf"])
offers = await scraper.scrape()

for offer in offers:
    print(f"{offer.name}: {offer.base_price}€/kWh")
```

### Via API

```bash
# Preview (DRY RUN)
curl http://localhost:8081/admin/offers/preview?provider=EDF

# Apply changes
curl -X POST http://localhost:8081/admin/offers/refresh?provider=EDF
```

## Adding a New Scraper

1. **Create scraper file** (e.g., `newprovider_scraper.py`):

```python
from .base import BasePriceScraper, OfferData

class NewProviderScraper(BasePriceScraper):
    TARIFF_PDF_URL = "https://..."

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("NewProvider")
        self.scraper_urls = scraper_urls or [self.TARIFF_PDF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        # Download PDF
        async with httpx.AsyncClient() as client:
            response = await client.get(self.scraper_urls[0])
            text = extract_text(BytesIO(response.content))

        # Parse and return offers
        return self._parse_pdf(text)

    def _parse_pdf(self, text: str) -> List[OfferData]:
        # Implement parsing logic
        offers = []
        # ... parse text and create OfferData instances
        return offers

    async def validate_data(self, offers: List[OfferData]) -> bool:
        # Validate offers
        return len(offers) > 0
```

2. **Add to `__init__.py`**:

```python
from .newprovider_scraper import NewProviderScraper

__all__ = [
    # ...
    "NewProviderScraper",
]
```

3. **Register in service** (`price_update_service.py`):

```python
SCRAPERS = {
    # ...
    "NewProvider": NewProviderScraper,
}
```

4. **Create provider in database**:

```sql
INSERT INTO energy_providers (name, logo_url, website, scraper_urls)
VALUES (
    'NewProvider',
    'https://logo.clearbit.com/newprovider.fr',
    'https://www.newprovider.fr',
    '["https://www.newprovider.fr/tarifs.pdf"]'::json
);
```

## Fallback Mechanism

All scrapers should implement fallback data:

```python
FALLBACK_PRICES = {
    "BASE": {
        3: {"subscription": 10.0, "kwh": 0.20},
        # ... all power levels
    },
}

async def fetch_offers(self):
    try:
        # Attempt to scrape
        return self._scrape_from_source()
    except Exception as e:
        self.logger.warning(f"Scraping failed: {e}")
        # Use fallback
        return self._get_fallback_offers()
```

## Testing

```python
# Test scraper
import asyncio
from src.services.price_scrapers.edf_scraper import EDFPriceScraper

async def test():
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()
    print(f"Scraped {len(offers)} offers")

    # Validate
    is_valid = await scraper.validate_data(offers)
    print(f"Valid: {is_valid}")

    # Show sample
    for offer in offers[:3]:
        print(f"  {offer.name}: {offer.subscription_price}€ + {offer.base_price}€/kWh")

asyncio.run(test())
```

## Dynamic URL Management

URLs are stored in database and can be updated via admin interface:

```python
# Scraper receives URLs from database
scraper = EDFPriceScraper(scraper_urls=provider.scraper_urls)

# If no URLs in DB, uses default hardcoded URLs
scraper = EDFPriceScraper()  # Uses TARIFF_BLEU_URL, ZEN_WEEKEND_URL
```

## Price Validation Rules

Each scraper validates:
- **Positive prices**: All prices > 0
- **Valid power levels**: Only 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA
- **Type consistency**:
  - BASE: requires `base_price`
  - HC_HP, WEEKEND, HC_NUIT_WEEKEND: requires `hp_price` and `hc_price`
  - TEMPO: requires 6 prices (blue/white/red × hp/hc)
  - BASE_WEEKEND: requires `base_price` and `base_price_weekend`
  - HC_WEEKEND: requires `hp_price`, `hc_price`, and optionally `hp_price_weekend`, `hc_price_weekend`
  - SEASONAL: requires winter/summer × hp/hc prices
- **Reasonable ranges**: Prices within expected market ranges

## Offer Types

- **BASE**: Single flat rate (€/kWh)
- **HC_HP**: Off-peak / Peak hours (2 rates) - standard PDL offpeak hours
- **TEMPO**: 3 colors × 2 periods = 6 rates (EDF only)
- **EJP**: Normal / Peak days (2 rates, legacy)
- **BASE_WEEKEND**: Base weekday + reduced base weekend (2 rates)
- **HC_WEEKEND**: HC/HP weekday (PDL hours) + all weekend as HC (3 rates)
- **HC_NUIT_WEEKEND**: HC 23h-6h weekday + all weekend as HC (same as WEEKEND)
- **WEEKEND**: Enercoop type - same behavior as HC_NUIT_WEEKEND (23h-6h weekday + weekend)
- **SEASONAL**: Winter/Summer × HC/HP = 4 rates

**Note**: The `WEEKEND` type (used by Enercoop for "Flexi Watt - Nuit & Week-end") is functionally equivalent to `HC_NUIT_WEEKEND`. Both use:
- Weekdays: HP from 6h to 23h, HC from 23h to 6h
- Weekend: all hours are HC (off-peak)

## Logging

All scrapers log to `src.services.price_scrapers.{provider}`:

```python
self.logger.info("Successfully scraped X offers")
self.logger.warning("PDF download failed, using fallback")
self.logger.error("Validation failed")
```

## Common Issues

### SSL Certificate Errors

Some providers have certificate issues. Use `verify=False`:

```python
async with httpx.AsyncClient(verify=False) as client:
    response = await client.get(url)
```

### PDF Parsing Failures

Always implement fallback:

```python
try:
    offers = self._parse_pdf(pdf_text)
    if not offers:
        raise Exception("No offers extracted")
except:
    offers = self._get_fallback_offers()
```

### URL Changes

When a provider changes their URL:
1. Update via admin interface (/admin/offers)
2. Or update directly in database
3. Test with preview endpoint first

## Documentation

- Main docs: `/docs/features-spec/energy-providers-scrapers.md`
- Admin page: `/docs/pages/admin-offers.md`
- API reference: FastAPI docs at `/docs`

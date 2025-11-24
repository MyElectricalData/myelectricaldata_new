"""Tests for Enercoop price scraper"""
import pytest
from src.services.price_scrapers.enercoop_scraper import EnercoopPriceScraper


@pytest.mark.asyncio
async def test_enercoop_scraper_fallback_offers():
    """Test that Enercoop scraper returns fallback offers"""
    scraper = EnercoopPriceScraper()
    offers = await scraper.scrape()

    # Should have offers for BASE and HC_HP
    assert len(offers) > 0

    # Check BASE offers
    base_offers = [o for o in offers if o.offer_type == "BASE"]
    assert len(base_offers) == 9  # 9 power levels

    # Check HC_HP offers
    hc_hp_offers = [o for o in offers if o.offer_type == "HC_HP"]
    assert len(hc_hp_offers) == 8  # 8 power levels (6-36)

    # Validate a BASE offer
    base_6kva = next((o for o in base_offers if o.power_kva == 6), None)
    assert base_6kva is not None
    assert "Enercoop" in base_6kva.name or "Particuliers" in base_6kva.name
    assert base_6kva.subscription_price > 0
    assert base_6kva.base_price is not None
    assert base_6kva.base_price > 0


@pytest.mark.asyncio
async def test_enercoop_scraper_validate_data():
    """Test data validation"""
    scraper = EnercoopPriceScraper()
    offers = await scraper.scrape()

    # Validation should pass for fallback data
    is_valid = await scraper.validate_data(offers)
    assert is_valid is True


@pytest.mark.asyncio
async def test_enercoop_prices_higher_than_regulated():
    """Test that Enercoop prices are typically higher than regulated tariffs"""
    scraper = EnercoopPriceScraper()
    offers = await scraper.scrape()

    # Check BASE offer - should be >= 0.20 €/kWh
    base_offer = next((o for o in offers if o.offer_type == "BASE"), None)
    assert base_offer is not None
    assert base_offer.base_price >= 0.20  # Green energy premium

"""Tests for TotalEnergies price scraper"""
import pytest
from src.services.price_scrapers.totalenergies_scraper import TotalEnergiesPriceScraper


@pytest.mark.asyncio
async def test_totalenergies_scraper_fallback_offers():
    """Test that TotalEnergies scraper returns fallback offers"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    # Should have offers for multiple products
    assert len(offers) > 0

    # Check we have both Verte Fixe and Online offers
    verte_offers = [o for o in offers if "Verte Fixe" in o.name]
    online_offers = [o for o in offers if "Online" in o.name]

    assert len(verte_offers) > 0
    assert len(online_offers) > 0


@pytest.mark.asyncio
async def test_totalenergies_scraper_validate_data():
    """Test data validation"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    # Validation should pass for fallback data
    is_valid = await scraper.validate_data(offers)
    assert is_valid is True


@pytest.mark.asyncio
async def test_totalenergies_online_cheaper_than_verte():
    """Test that Online offers are cheaper than Verte Fixe"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    # Compare same power, same option
    verte_base_6 = next((o for o in offers if "Verte Fixe" in o.name and o.offer_type == "BASE" and o.power_kva == 6), None)
    online_base_6 = next((o for o in offers if "Online" in o.name and o.offer_type == "BASE" and o.power_kva == 6), None)

    if verte_base_6 and online_base_6:
        # Online should be cheaper
        assert online_base_6.subscription_price <= verte_base_6.subscription_price
        assert online_base_6.base_price <= verte_base_6.base_price


@pytest.mark.asyncio
async def test_totalenergies_offer_variety():
    """Test that we have both BASE and HC_HP offers"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    base_offers = [o for o in offers if o.offer_type == "BASE"]
    hchp_offers = [o for o in offers if o.offer_type == "HC_HP"]

    assert len(base_offers) > 0
    assert len(hchp_offers) > 0

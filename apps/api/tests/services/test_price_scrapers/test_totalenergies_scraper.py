"""Tests for TotalEnergies price scraper"""
import pytest
from src.services.price_scrapers.totalenergies_scraper import TotalEnergiesPriceScraper


@pytest.mark.asyncio
async def test_totalenergies_scraper_returns_offers():
    """Test that TotalEnergies scraper returns offers from PDFs"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    # Should have offers for multiple products
    assert len(offers) > 0

    # Check we have both Verte Fixe and Essentielle offers (from PDFs)
    # Or fallback Online offers if PDFs fail
    verte_offers = [o for o in offers if "Verte Fixe" in o.name]
    essentielle_offers = [o for o in offers if "Essentielle" in o.name]
    online_offers = [o for o in offers if "Online" in o.name]

    # At least one of these offer types should be present
    assert len(verte_offers) > 0 or len(essentielle_offers) > 0 or len(online_offers) > 0


@pytest.mark.asyncio
async def test_totalenergies_scraper_validate_data():
    """Test data validation"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    # Validation should pass
    is_valid = await scraper.validate_data(offers)
    assert is_valid is True


@pytest.mark.asyncio
async def test_totalenergies_essentielle_cheaper_than_verte():
    """Test that Essentielle offers are cheaper than Verte Fixe"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    # Compare same power, same option
    verte_base_6 = next((o for o in offers if "Verte Fixe" in o.name and o.offer_type == "BASE" and o.power_kva == 6), None)
    essentielle_base_6 = next((o for o in offers if "Essentielle" in o.name and o.offer_type == "BASE" and o.power_kva == 6), None)

    if verte_base_6 and essentielle_base_6:
        # Essentielle should be cheaper (indexed to regulated tariff)
        assert essentielle_base_6.subscription_price <= verte_base_6.subscription_price
        # Note: Essentielle kWh is at TRV level, Verte Fixe is fixed/green
        # so prices might be similar or different based on market conditions


@pytest.mark.asyncio
async def test_totalenergies_offer_variety():
    """Test that we have both BASE and HC_HP offers"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    base_offers = [o for o in offers if o.offer_type == "BASE"]
    hchp_offers = [o for o in offers if o.offer_type == "HC_HP"]

    assert len(base_offers) > 0
    assert len(hchp_offers) > 0


@pytest.mark.asyncio
async def test_totalenergies_pdf_parsing_not_fallback():
    """Test that PDF parsing works and fallback is not used"""
    scraper = TotalEnergiesPriceScraper()
    offers = await scraper.scrape()

    # Verify offers were scraped from PDFs, not fallback
    assert len(offers) > 0
    assert scraper.used_fallback is False

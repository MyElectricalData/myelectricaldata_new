"""Tests for EDF price scraper"""
import pytest
from src.services.price_scrapers.edf_scraper import EDFPriceScraper


@pytest.mark.asyncio
async def test_edf_scraper_fallback_offers():
    """Test that EDF scraper returns fallback offers"""
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()

    # Should have offers for BASE, HC_HP, and TEMPO
    assert len(offers) > 0

    # Check BASE offers
    base_offers = [o for o in offers if o.offer_type == "BASE"]
    assert len(base_offers) == 9  # 9 power levels (3, 6, 9, 12, 15, 18, 24, 30, 36)

    # Check HC_HP offers
    hc_hp_offers = [o for o in offers if o.offer_type == "HC_HP"]
    assert len(hc_hp_offers) == 8  # 8 power levels (6-36, no 3kVA)

    # Check TEMPO offers
    tempo_offers = [o for o in offers if o.offer_type == "TEMPO"]
    assert len(tempo_offers) == 8  # 8 power levels

    # Validate a BASE offer
    base_6kva = next((o for o in base_offers if o.power_kva == 6), None)
    assert base_6kva is not None
    assert base_6kva.name == "Tarif Bleu - Base 6 kVA"
    assert base_6kva.subscription_price > 0
    assert base_6kva.base_price is not None
    assert base_6kva.base_price > 0
    assert base_6kva.hc_price is None
    assert base_6kva.hp_price is None


@pytest.mark.asyncio
async def test_edf_scraper_validate_data():
    """Test data validation"""
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()

    # Validation should pass for fallback data
    is_valid = await scraper.validate_data(offers)
    assert is_valid is True


@pytest.mark.asyncio
async def test_edf_scraper_base_offer_structure():
    """Test BASE offer structure"""
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()

    base_offer = next((o for o in offers if o.offer_type == "BASE"), None)
    assert base_offer is not None
    assert base_offer.offer_type == "BASE"
    assert base_offer.base_price is not None
    assert base_offer.base_price > 0
    assert base_offer.hc_price is None
    assert base_offer.hp_price is None
    assert base_offer.power_kva in [3, 6, 9, 12, 15, 18, 24, 30, 36]


@pytest.mark.asyncio
async def test_edf_scraper_hchp_offer_structure():
    """Test HC/HP offer structure"""
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()

    hchp_offer = next((o for o in offers if o.offer_type == "HC_HP"), None)
    assert hchp_offer is not None
    assert hchp_offer.offer_type == "HC_HP"
    assert hchp_offer.base_price is None
    assert hchp_offer.hc_price is not None
    assert hchp_offer.hp_price is not None
    assert hchp_offer.hc_price > 0
    assert hchp_offer.hp_price > 0
    assert hchp_offer.hc_price < hchp_offer.hp_price  # HC should be cheaper than HP


@pytest.mark.asyncio
async def test_edf_scraper_tempo_offer_structure():
    """Test TEMPO offer structure"""
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()

    tempo_offer = next((o for o in offers if o.offer_type == "TEMPO"), None)
    assert tempo_offer is not None
    assert tempo_offer.offer_type == "TEMPO"
    assert tempo_offer.tempo_blue_hc is not None
    assert tempo_offer.tempo_blue_hp is not None
    assert tempo_offer.tempo_white_hc is not None
    assert tempo_offer.tempo_white_hp is not None
    assert tempo_offer.tempo_red_hc is not None
    assert tempo_offer.tempo_red_hp is not None

    # Verify price progression: Blue < White < Red
    assert tempo_offer.tempo_blue_hp < tempo_offer.tempo_white_hp
    assert tempo_offer.tempo_white_hp < tempo_offer.tempo_red_hp

    # Verify HC < HP for each color
    assert tempo_offer.tempo_blue_hc < tempo_offer.tempo_blue_hp
    assert tempo_offer.tempo_white_hc < tempo_offer.tempo_white_hp
    assert tempo_offer.tempo_red_hc < tempo_offer.tempo_red_hp

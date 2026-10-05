"""Noms d'offres canoniques : le nom commercial seul (MED-22).

La puissance est portée par `power_kva` et l'option par `offer_type` : ni l'une ni l'autre
ne doit se retrouver dans `name`, sinon une même offre existe sous plusieurs noms
(ex. "Tarif Bleu" et "Tarif Bleu - 9 kVA" actives en même temps).
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.routers import energy_offers
from src.services.price_scrapers import edf_scraper
from src.services.price_scrapers.edf_scraper import EDFPriceScraper


class _FakePdf:
    pages: list = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def zen_offers(monkeypatch):
    """Offres Zen Week-End construites par le scraper, sans PDF ni réseau."""
    monkeypatch.setattr(edf_scraper.pdfplumber, "open", lambda *_: _FakePdf())
    scraper = EDFPriceScraper()
    monkeypatch.setattr(
        scraper, "_extract_zen_weekend_prices",
        lambda _: {6: {"subscription": 15.0, "semaine": 0.25, "weekend": 0.18}},
    )
    monkeypatch.setattr(
        scraper, "_extract_zen_hc_weekend_prices",
        lambda _: {6: {"subscription": 15.5, "hp_semaine": 0.27, "hc_semaine": 0.20,
                       "hp_weekend": 0.19, "hc_weekend": 0.17}},
    )
    monkeypatch.setattr(
        scraper, "_extract_zen_flex_prices",
        lambda _: {6: {"subscription": 14.0, "hc_eco": 0.16, "hp_eco": 0.21,
                       "hc_sobriete": 0.20, "hp_sobriete": 0.70}},
    )
    return scraper._parse_zen_weekend_pdf(b"%PDF")


def test_zen_weekend_trois_options(zen_offers):
    assert sorted(o.offer_type for o in zen_offers) == ["BASE_WEEKEND", "HC_WEEKEND", "ZEN_FLEX"]


def test_zen_weekend_nom_commercial_seul(zen_offers):
    assert {o.name for o in zen_offers} == {"Zen Week-End"}


def test_zen_weekend_puissance_dans_power_kva(zen_offers):
    assert all(o.power_kva == 6 for o in zen_offers)
    assert not any("kVA" in o.name for o in zen_offers)


@pytest.mark.asyncio
async def test_contribution_multi_puissances_sans_kva_dans_le_nom(monkeypatch):
    monkeypatch.setattr(energy_offers, "deactivate_previous_offers", AsyncMock(return_value=0))
    db = MagicMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    contribution = SimpleNamespace(
        id="c1",
        contribution_type="NEW_OFFER",
        existing_provider_id="p1",
        provider_name=None,
        provider_website=None,
        offer_name="Classique",
        offer_type="BASE",
        description=None,
        pricing_data={},
        power_variants=[
            {"power_kva": 6, "subscription_price": 12.0, "base_price": 0.2},
            {"power_kva": 9, "subscription_price": 15.0, "base_price": 0.2},
        ],
        hc_schedules=None,
        valid_from=None,
        price_sheet_url=None,
        status="PENDING",
    )

    await energy_offers.apply_contribution_changes(contribution, db, reviewer_id="admin")

    created = [c.args[0] for c in db.add.call_args_list if c.args[0].__class__.__name__ == "EnergyOffer"]
    assert [(o.name, o.power_kva) for o in created] == [("Classique", 6), ("Classique", 9)]

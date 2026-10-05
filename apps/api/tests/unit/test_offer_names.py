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
    noms = {o.offer_type: o.name for o in zen_offers}
    assert noms == {
        "BASE_WEEKEND": "Zen Week-End",
        "HC_WEEKEND": "Zen Week-End",
        # "Option Flex" fait partie du nom : l'export Home Assistant (MED-21) s'en sert
        "ZEN_FLEX": "Zen Week-End - Option Flex",
    }


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


# Mêmes cas que la migration c3d4e5f6g7h8 : le backend doit produire les noms qu'elle produit
from tests.integration.test_migration_clean_offer_names_v2 import CAS  # noqa: E402


@pytest.mark.parametrize(("brut", "_type", "attendu"), CAS)
def test_clean_offer_name_meme_regle_que_la_migration(brut, _type, attendu):
    from src.services.offer_names import clean_offer_name

    assert clean_offer_name(brut) == attendu


@pytest.mark.parametrize("marqueur", [
    "[SUPPRESSION] EDF - Tarif Bleu - 6 kVA",
    "[RENOMMAGE] Classique - 6 kVA",
    "[SUPPRESSION FOURNISSEUR] OHM",
])
def test_clean_offer_name_laisse_les_marqueurs(marqueur):
    from src.services.offer_names import clean_offer_name

    assert clean_offer_name(marqueur) == marqueur


@pytest.mark.asyncio
async def test_contribution_une_seule_offre_nom_normalise(monkeypatch):
    monkeypatch.setattr(energy_offers, "deactivate_previous_offers", AsyncMock(return_value=0))
    db = MagicMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    contribution = SimpleNamespace(
        id="c2",
        contribution_type="NEW_OFFER",
        existing_provider_id="p1",
        provider_name=None,
        provider_website=None,
        offer_name="Zen Fixe - Option Base - 9 kVA",
        offer_type="BASE",
        description=None,
        pricing_data={"subscription_price": 15.0, "base_price": 0.2},
        power_variants=None,
        power_kva=9,
        hc_schedules=None,
        valid_from=None,
        price_sheet_url=None,
        status="PENDING",
    )

    await energy_offers.apply_contribution_changes(contribution, db, reviewer_id="admin")

    created = [c.args[0] for c in db.add.call_args_list if c.args[0].__class__.__name__ == "EnergyOffer"]
    assert [(o.name, o.power_kva) for o in created] == [("Zen Fixe", 9)]


def test_zen_flex_nettoyee_reste_reconnue_par_l_export_home_assistant():
    """MED-21 : Zen Flex servie en SEASONAL n'a pas de coût, reconnue à "Option Flex" dans le nom.
    Le nom nettoyé (migration, contributions) doit garder ce repère, clients déjà déployés compris."""
    from datetime import date

    from src.services.exporters.home_assistant import _day_price
    from src.services.offer_names import clean_offer_name

    zen_flex = SimpleNamespace(
        name=clean_offer_name("Zen Week-End - Option Flex - 6 kVA"), offer_type="SEASONAL",
        hc_price_winter="0.2091", hp_price_winter="0.7253", hc_price_summer="0.1519", hp_price_summer="0.2091",
    )
    assert _day_price(zen_flex, "hp", date(2026, 1, 15)) is None

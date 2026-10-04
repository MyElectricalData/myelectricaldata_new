"""Compte de démo au format Data Connect 2026 (MED-14)."""

from unittest.mock import AsyncMock

import pytest

from src.adapters.demo_adapter import DemoAdapter
from src.services.enedis_contract import parse_contract

PRM = "99999999999991"


@pytest.fixture
def demo(monkeypatch):
    adapter = DemoAdapter()
    cache = AsyncMock()
    cache.get.return_value = {
        "subscribed_power": 9,
        "offpeak_hours": {"monday": "HC (22h00-06h00)", "tuesday": "HC (22h00-06h00)"},
        "activation_date": "2020-01-15",
    }
    monkeypatch.setattr(adapter, "cache_service", cache)
    return adapter


async def test_consommation_quotidienne_au_format_2026(demo):
    data = await demo.get_consumption_daily(PRM, "2026-09-01", "2026-09-08", "secret")

    grandeur = data["grandeur"][0]
    assert grandeur["grandeurMetier"] == "CONS"
    assert grandeur["points"] and {"v", "d"} <= set(grandeur["points"][0])
    assert "meter_reading" not in data


async def test_courbe_de_charge_au_format_2026(demo):
    data = await demo.get_consumption_detail(PRM, "2026-09-01", "2026-09-02", "secret")

    # La démo génère des kWh (Enedis : W) : défaut préexistant, l'unité déclarée est conservée
    assert data["grandeur"][0]["unite"] == "kWh"
    assert data["grandeur"][0]["points"][0]["p"].startswith("PT")


async def test_contrat_lisible_par_le_parseur_unique(demo):
    parsed = parse_contract(await demo.get_contract(PRM, "secret"))

    assert parsed["subscribed_power"] == 9
    assert parsed["offpeak_hours"] == {"ranges": ["22:00-06:00"]}
    assert str(parsed["activation_date"]) == "2020-01-15"

"""Coût du panneau Énergie : prix choisi jour par jour (MED-21)

SEASONAL n'a que des prix été/hiver, HC_WEEKEND et BASE_WEEKEND un prix week-end : le coût ne
lisait que base_price / hc_price / hp_price, d'où un coût vide ou faux pour ces offres.
"""

from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.services.exporters.home_assistant import HomeAssistantExporter

PRICE_FIELDS = (
    "base_price", "hc_price", "hp_price",
    "base_price_weekend", "hc_price_weekend", "hp_price_weekend",
    "hc_price_winter", "hp_price_winter", "hc_price_summer", "hp_price_summer",
    "tempo_blue_hc", "tempo_blue_hp", "tempo_white_hc", "tempo_white_hp", "tempo_red_hc", "tempo_red_hp",
)


def offer(offer_type: str, **prices: str) -> SimpleNamespace:
    fields: dict[str, Any] = dict.fromkeys(PRICE_FIELDS)
    fields.update({k: Decimal(v) for k, v in prices.items()})
    return SimpleNamespace(name=f"Offre {offer_type}", offer_type=offer_type, **fields)


def fake_db(offer_row: SimpleNamespace) -> MagicMock:
    """execute() rend le PDL (avec offre choisie) puis l'offre, ordre de _get_cost_statistics_by_tariff"""
    results = []
    for row in (SimpleNamespace(selected_offer_id="offre-1"), offer_row):
        result = MagicMock()
        result.scalar_one_or_none.return_value = row
        results.append(result)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    return db


def stat(start: str, kwh: float = 1.0) -> dict[str, Any]:
    return {"start": start, "state": kwh, "sum": kwh}


async def costs(offer_row: SimpleNamespace, consumption: dict[str, list[dict[str, Any]]]) -> dict[str, list[float]]:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {}
    result = await exporter._get_cost_statistics_by_tariff(fake_db(offer_row), "123", consumption)
    return {tag: [s["state"] for s in stats] for tag, stats in result.items()}


# =============================================================================
# SEASONAL : hiver novembre-mars, été avril-octobre (offers/seasonal.py)
# =============================================================================


SEASONAL = offer(
    "SEASONAL", hc_price_winter="0.20", hp_price_winter="0.30", hc_price_summer="0.10", hp_price_summer="0.15"
)


async def test_seasonal_price_follows_the_season() -> None:
    result = await costs(SEASONAL, {
        "hp": [stat("2026-01-15T10:00:00+01:00"), stat("2026-07-15T10:00:00+02:00")],
        "hc": [stat("2026-01-15T02:00:00+01:00"), stat("2026-07-15T02:00:00+02:00")],
    })
    assert result == {"hp": [0.30, 0.15], "hc": [0.20, 0.10]}


@pytest.mark.parametrize(
    ("start", "price"),
    [
        ("2026-03-31T23:00:00+02:00", 0.30),  # dernier jour d'hiver (heure locale)
        ("2026-04-01T00:00:00+02:00", 0.15),
        ("2026-10-31T23:00:00+01:00", 0.15),  # dernier jour d'été
        ("2026-11-01T00:00:00+01:00", 0.30),
    ],
)
async def test_seasonal_boundaries(start: str, price: float) -> None:
    assert await costs(SEASONAL, {"hp": [stat(start)]}) == {"hp": [price]}


async def test_seasonal_cumulative_sum() -> None:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {}
    consumption = {"hp": [stat("2026-03-31T10:00:00+02:00", 2.0), stat("2026-04-01T10:00:00+02:00", 2.0)]}
    result = await exporter._get_cost_statistics_by_tariff(fake_db(SEASONAL), "123", consumption)
    assert [s["sum"] for s in result["hp"]] == [0.60, 0.90]


# =============================================================================
# Prix week-end : samedi et dimanche (heure locale)
# =============================================================================


@pytest.mark.parametrize("offer_type", ["HC_WEEKEND", "WEEKEND"])
async def test_hc_weekend_uses_weekend_prices(offer_type: str) -> None:
    hc_weekend = offer(offer_type, hc_price="0.20", hp_price="0.25", hc_price_weekend="0.12", hp_price_weekend="0.14")
    result = await costs(hc_weekend, {
        # vendredi 9, samedi 10, dimanche 11, lundi 12 octobre 2026
        "hp": [stat(f"2026-10-{d:02d}T10:00:00+02:00") for d in (9, 10, 11, 12)],
        "hc": [stat(f"2026-10-{d:02d}T02:00:00+02:00") for d in (9, 10, 11, 12)],
    })
    assert result == {"hp": [0.25, 0.14, 0.14, 0.25], "hc": [0.20, 0.12, 0.12, 0.20]}


async def test_weekend_price_falls_back_on_weekday_price() -> None:
    """hc_price_weekend est facultatif : sans lui, le week-end garde le prix de semaine"""
    hc_weekend = offer("HC_WEEKEND", hc_price="0.20", hp_price="0.25", hp_price_weekend="0.14")
    result = await costs(hc_weekend, {"hc": [stat("2026-10-10T02:00:00+02:00")], "hp": [stat("2026-10-10T10:00:00+02:00")]})
    assert result == {"hc": [0.20], "hp": [0.14]}


async def test_base_weekend_uses_weekend_price() -> None:
    base_weekend = offer("BASE_WEEKEND", base_price="0.25", base_price_weekend="0.18")
    result = await costs(base_weekend, {"base": [stat("2026-10-09T10:00:00+02:00"), stat("2026-10-10T10:00:00+02:00")]})
    assert result == {"base": [0.25, 0.18]}


# =============================================================================
# Non-régression : offres à prix fixe
# =============================================================================


async def test_hc_hp_and_base_unchanged() -> None:
    hc_hp = offer("HC_HP", hc_price="0.20", hp_price="0.25", hp_price_weekend="0.99")
    assert await costs(hc_hp, {"hp": [stat("2026-10-10T10:00:00+02:00")]}) == {"hp": [0.25]}
    base = offer("BASE", base_price="0.22")
    assert await costs(base, {"base": [stat("2026-10-10T10:00:00+02:00")]}) == {"base": [0.22]}


async def test_tempo_unchanged() -> None:
    tempo = offer("TEMPO", tempo_red_hp="0.70")
    assert await costs(tempo, {"red_hp": [stat("2026-01-15T10:00:00+01:00")]}) == {"red_hp": [0.70]}


# =============================================================================
# Séries vides et offres sans coût
# =============================================================================


async def test_empty_series_kept_when_offer_has_price() -> None:
    """L'import crée la statistique même sans donnée (ex. aucun jour rouge encore)"""
    tempo = offer("TEMPO", tempo_blue_hp="0.16", tempo_red_hp="0.70")
    result = await costs(tempo, {"blue_hp": [stat("2026-10-05T10:00:00+02:00")], "red_hp": []})
    assert result == {"blue_hp": [0.16], "red_hp": []}


async def test_empty_series_without_price_dropped() -> None:
    hc_hp = offer("HC_HP", hp_price="0.25")
    assert await costs(hc_hp, {"hc": [], "hp": []}) == {"hp": []}


async def test_zen_flex_has_no_cost_even_with_fixed_prices() -> None:
    """Prix Éco / Sobriété dans *_winter / *_summer, jours Sobriété inconnus (MED-27) : pas de coût faux"""
    zen_flex = offer("ZEN_FLEX", hc_price="0.15", hp_price="0.20", hc_price_winter="0.15", hc_price_summer="0.40")
    assert await costs(zen_flex, {"hc": [stat("2026-01-15T02:00:00+01:00")]}) == {}

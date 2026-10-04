"""Tests du branchement HP/HC dans les exporters (issue #113)"""

import inspect
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.tariff import TariffProfile


def make_exporter() -> HomeAssistantExporter:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {}
    return exporter


def fake_db(pdl_row: SimpleNamespace | None, contract_row: SimpleNamespace | None) -> MagicMock:
    """Session dont execute() renvoie la ligne PDL puis la ligne ContractData (ordre de _get_pdl_contract_info)"""
    results = []
    for row in (pdl_row, contract_row):
        result = MagicMock()
        result.first.return_value = row
        results.append(result)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    return db


def row(pricing_option: str | None, offpeak_hours: object, subscribed_power: int | None) -> SimpleNamespace:
    return SimpleNamespace(pricing_option=pricing_option, offpeak_hours=offpeak_hours, subscribed_power=subscribed_power)


# =============================================================================
# _get_pdl_contract_info
# =============================================================================


async def test_contract_info_prefers_pdl_pricing_option_over_enedis_code() -> None:
    """Mode client : ContractData.pricing_option porte le code d'acheminement Enedis, pas l'option fournisseur"""
    db = fake_db(
        row("HC_HP", None, 6),
        row("BTINFMUDT", {"ranges": ["22:00-06:00"]}, 9),
    )
    profile, ranges, power = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile == TariffProfile("HC_HP")
    assert ranges == [(1320, 360)]
    assert power == 9


async def test_contract_info_falls_back_on_pdl_ranges() -> None:
    db = fake_db(row("HC_NUIT_WEEKEND", {"default": "HC (23H00-6H00)"}, 6), None)
    profile, ranges, power = await make_exporter()._get_pdl_contract_info(db, "123")
    assert profile == TariffProfile("HC_HP", weekend_offpeak=True)
    assert ranges == [(1380, 360)]
    assert power == 6


async def test_contract_info_unknown_pdl() -> None:
    profile, ranges, power = await make_exporter()._get_pdl_contract_info(fake_db(None, None), "123")
    assert (profile, ranges, power) == (TariffProfile("BASE"), [], None)


# =============================================================================
# _get_hp_hc_summary
# =============================================================================


async def test_hp_hc_summary_skips_base_contract_with_stale_ranges() -> None:
    """Plages Enedis restées en base après un passage en BASE : pas de HP/HC publié"""
    db = fake_db(row("BASE", {"ranges": ["22:00-06:00"]}, 6), None)
    assert await make_exporter()._get_hp_hc_summary(db, "123", date(2026, 10, 7)) is None
    assert db.execute.await_count == 2  # aucune requête sur les données détaillées


# =============================================================================
# _export_hp_hc_sensors
# =============================================================================


async def test_export_hp_hc_sensors_publishes_8_sensors() -> None:
    exporter = make_exporter()
    summary = {f"{p}_{t}_kwh": 1.0 for p in ("yesterday", "this_week", "this_month", "this_year") for t in ("hp", "hc")}
    with (
        patch.object(exporter, "_get_hp_hc_summary", AsyncMock(return_value=summary)),
        patch.object(exporter, "_publish_sensor_old_format", AsyncMock()) as publish,
    ):
        count = await exporter._export_hp_hc_sensors(MagicMock(), MagicMock(), "123")

    assert count == 8
    unique_ids = {call.kwargs["unique_id"] for call in publish.await_args_list}
    assert "myelectricaldata_linky_123_consumption_yesterday_hc" in unique_ids
    assert "myelectricaldata_linky_123_consumption_this_year_hp" in unique_ids
    assert len(unique_ids) == 8


async def test_export_hp_hc_sensors_nothing_without_summary() -> None:
    exporter = make_exporter()
    with (
        patch.object(exporter, "_get_hp_hc_summary", AsyncMock(return_value=None)),
        patch.object(exporter, "_publish_sensor_old_format", AsyncMock()) as publish,
    ):
        assert await exporter._export_hp_hc_sensors(MagicMock(), MagicMock(), "123") == 0
    publish.assert_not_awaited()


@pytest.mark.parametrize("method", ["run_full_export", "run_full_export_with_progress"])
def test_full_exports_publish_hp_hc_sensors(method: str) -> None:
    """Garde-fou : les capteurs HP/HC doivent être publiés par les deux exports complets"""
    assert "_export_hp_hc_sensors" in inspect.getsource(getattr(HomeAssistantExporter, method))

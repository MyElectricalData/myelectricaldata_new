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
    exporter.prefix = "myelectricaldata"
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


def fake_db_with_offer(pdl_row: SimpleNamespace, offer_row: SimpleNamespace | None) -> MagicMock:
    """execute() : ligne PDL (avec offre choisie), ligne ContractData absente, puis l'offre"""
    results = []
    for value in (pdl_row, None, offer_row):
        result = MagicMock()
        result.first.return_value = value
        results.append(result)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    return db


def pdl_with_offer(pricing_option: str | None) -> SimpleNamespace:
    return SimpleNamespace(
        pricing_option=pricing_option,
        offpeak_hours={"default": "HC (22H00-6H00)"},  # plage Enedis, pas la grille Zen Flex
        subscribed_power=6,
        selected_offer_id="offre-1",
    )


def offer_row(offer_type: str, name: str, hc_schedules: object = None) -> SimpleNamespace:
    return SimpleNamespace(offer_type=offer_type, name=name, hc_schedules=hc_schedules)


async def test_contract_info_zen_flex_uses_edf_supplier_offpeak_grid() -> None:
    """Zen Flex : 17 h creuses par jour (13h-18h et 20h-8h, HP 8h-13h et 18h-20h), pas les 8 h du contrat Enedis"""
    zen_flex = offer_row("SEASONAL", "Zen Week-End - Option Flex - 6 kVA")
    profile, ranges, _ = await make_exporter()._get_pdl_contract_info(
        fake_db_with_offer(pdl_with_offer("HC_HP"), zen_flex), "123"
    )
    assert profile.family == "HC_HP"
    assert ranges == [(780, 1080), (1200, 480)]
    offpeak_minutes = sum(1 for m in range(0, 24 * 60, 30) if any(
        (start <= m < end) if start < end else (m >= start or m < end) for start, end in ranges
    )) * 30
    assert offpeak_minutes == 17 * 60


async def test_contract_info_zen_flex_prefers_offer_hc_schedules() -> None:
    zen_flex = offer_row("ZEN_FLEX", "Zen Week-End - Option Flex 6 kVA", {"ranges": ["12:00-17:00", "21:00-07:00"]})
    _, ranges, _ = await make_exporter()._get_pdl_contract_info(fake_db_with_offer(pdl_with_offer(None), zen_flex), "123")
    assert ranges == [(720, 1020), (1260, 420)]


async def test_contract_info_zen_flex_without_pricing_option_is_hc_hp() -> None:
    zen_flex = offer_row("SEASONAL", "Zen Week-End - Option Flex - 9 kVA")
    profile, _, _ = await make_exporter()._get_pdl_contract_info(fake_db_with_offer(pdl_with_offer(None), zen_flex), "123")
    assert profile.family == "HC_HP"


@pytest.mark.parametrize("pricing_option", ["HC_NUIT_WEEKEND", "TEMPO", "BASE"])
async def test_contract_info_zen_flex_profile_ignores_pricing_option(pricing_option: str) -> None:
    """Le week-end Zen Flex a aussi ses heures pleines, et le coût suit la famille HC/HP de l'offre"""
    zen_flex = offer_row("SEASONAL", "Zen Week-End - Option Flex - 6 kVA")
    profile, _, _ = await make_exporter()._get_pdl_contract_info(
        fake_db_with_offer(pdl_with_offer(pricing_option), zen_flex), "123"
    )
    assert profile == TariffProfile("HC_HP")


async def test_contract_info_other_offer_keeps_contract_ranges() -> None:
    flexiwatt = offer_row("SEASONAL", "FlexiWatt 2 saisons - 6 kVA")
    _, ranges, _ = await make_exporter()._get_pdl_contract_info(fake_db_with_offer(pdl_with_offer("HC_HP"), flexiwatt), "123")
    assert ranges == [(1320, 360)]


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

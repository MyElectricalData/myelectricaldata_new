"""Tests de l'export des coûts (€) et des statistiques long-terme pour Home Assistant"""

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.exporters.home_assistant import HomeAssistantExporter, TEMPO_PRICES
from src.services.exporters.tariff import TariffProfile


def make_exporter(config: dict | None = None) -> HomeAssistantExporter:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = config or {}
    exporter.broker = "localhost"
    exporter.port = 1883
    exporter.username = None
    exporter.password = None
    exporter.use_tls = False
    exporter.prefix = "myelectricaldata"
    exporter.discovery_prefix = "homeassistant"
    return exporter


def fake_db(pdl_row: SimpleNamespace | None = None, offer_row: SimpleNamespace | None = None) -> MagicMock:
    db = MagicMock()
    # Mock pour db.execute(select(...))
    async def mock_execute(query):
        res = MagicMock()
        query_str = str(query)
        if "energy_offers" in query_str.lower():
            res.scalar_one_or_none.return_value = offer_row
            res.first.return_value = offer_row
        else:
            res.scalar_one_or_none.return_value = pdl_row
            res.first.return_value = pdl_row
        return res

    db.execute = AsyncMock(side_effect=mock_execute)
    return db


# =============================================================================
# _get_pdl_prices
# =============================================================================


async def test_get_pdl_prices_with_selected_offer() -> None:
    exporter = make_exporter()
    offer = SimpleNamespace(
        id="offer-1",
        name="Offre Verte",
        offer_type="HC_HP",
        hc_price=0.18,
        hp_price=0.24,
        base_price=None,
    )
    pdl = SimpleNamespace(usage_point_id="123", selected_offer_id="offer-1", pricing_option="HC_HP")

    with patch.object(exporter, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("HC_HP"), [], 6))):
        prices = await exporter._get_pdl_prices(fake_db(pdl, offer), "123")

    assert prices == {"hc": 0.18, "hp": 0.24}


async def test_get_pdl_prices_fallback_tempo() -> None:
    exporter = make_exporter()
    pdl = SimpleNamespace(usage_point_id="123", selected_offer_id=None, pricing_option="TEMPO")

    with patch.object(exporter, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("TEMPO"), [], 9))):
        prices = await exporter._get_pdl_prices(fake_db(pdl, None), "123")

    assert prices == TEMPO_PRICES


async def test_get_pdl_prices_fallback_config() -> None:
    exporter = make_exporter({"kwh_price_hc": 0.15, "kwh_price_hp": 0.22})
    pdl = SimpleNamespace(usage_point_id="123", selected_offer_id=None, pricing_option="HC_HP")

    with patch.object(exporter, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("HC_HP"), [], 6))):
        prices = await exporter._get_pdl_prices(fake_db(pdl, None), "123")

    assert prices == {"hc": 0.15, "hp": 0.22}


async def test_get_pdl_prices_fallback_default_base() -> None:
    exporter = make_exporter()
    pdl = SimpleNamespace(usage_point_id="123", selected_offer_id=None, pricing_option="BASE")

    with patch.object(exporter, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("BASE"), [], 6))):
        prices = await exporter._get_pdl_prices(fake_db(pdl, None), "123")

    assert prices == {"base": 0.2516}


# =============================================================================
# _export_cost_sensors
# =============================================================================


async def test_export_cost_sensors_base() -> None:
    exporter = make_exporter()
    stats = MagicMock()
    stats.get_day_total = AsyncMock(return_value=10000)  # 10 kWh

    with (
        patch.object(exporter, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("BASE"), [], 6))),
        patch.object(exporter, "_get_pdl_prices", AsyncMock(return_value={"base": 0.25})),
        patch.object(exporter, "_publish_sensor_old_format", AsyncMock()) as publish,
    ):
        count = await exporter._export_cost_sensors(MagicMock(), stats, MagicMock(), "12345678901234")

    assert count == 1
    call = publish.await_args_list[0]
    assert call.kwargs["unique_id"] == "myelectricaldata_linky_12345678901234_cost"
    assert call.kwargs["object_id"] == "linky_12345678901234_cost"
    assert call.kwargs["state"] == 2.5  # 10 kWh * 0.25 EUR/kWh
    assert call.kwargs["unit"] == "EUR"
    assert call.kwargs["device_class"] == "monetary"
    assert call.kwargs["state_class"] == "total"


async def test_export_cost_sensors_hp_hc() -> None:
    exporter = make_exporter()
    stats = MagicMock()
    stats.get_day_total = AsyncMock(return_value=12000)
    summary = {"yesterday_hp_kwh": 8.0, "yesterday_hc_kwh": 4.0}

    with (
        patch.object(exporter, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("HC_HP"), [], 9))),
        patch.object(exporter, "_get_pdl_prices", AsyncMock(return_value={"hp": 0.25, "hc": 0.15})),
        patch.object(exporter, "_get_hp_hc_summary", AsyncMock(return_value=summary)),
        patch.object(exporter, "_publish_sensor_old_format", AsyncMock()) as publish,
    ):
        count = await exporter._export_cost_sensors(MagicMock(), stats, MagicMock(), "12345678901234")

    # 1 global + 1 HP + 1 HC = 3
    assert count == 3
    unique_ids = {call.kwargs["unique_id"] for call in publish.await_args_list}
    assert "myelectricaldata_linky_12345678901234_cost" in unique_ids
    assert "myelectricaldata_linky_12345678901234_cost_hp" in unique_ids
    assert "myelectricaldata_linky_12345678901234_cost_hc" in unique_ids


# =============================================================================
# import_statistics (coûts)
# =============================================================================


async def test_import_statistics_injects_both_external_and_entity_cost_stats() -> None:
    exporter = make_exporter()
    exporter._has_websocket_config = MagicMock(return_value=True)
    exporter.config["ha_token"] = "fake-token"

    cost_by_tariff = {
        "base": [
            {"start": "2026-10-01T00:00:00+02:00", "state": 0.5, "sum": 0.5},
            {"start": "2026-10-01T01:00:00+02:00", "state": 0.3, "sum": 0.8},
        ]
    }

    mock_ws = AsyncMock()
    mock_ws.recv = AsyncMock(side_effect=[
        '{"type": "auth_required"}',
        '{"type": "auth_ok"}',
    ])
    mock_ws_connect = MagicMock()
    mock_ws_connect.return_value.__aenter__.return_value = mock_ws

    imported_stats_calls = []

    async def fake_import_chunks(ws, stats, meta, **kwargs):
        imported_stats_calls.append(meta)
        return len(stats), kwargs.get("msg_id_start", 1) + 1, []

    with (
        patch.object(exporter, "_ws_connect", mock_ws_connect),
        patch.object(exporter, "_get_consumption_statistics_by_tariff", AsyncMock(return_value={})),
        patch.object(exporter, "_get_cost_statistics_by_tariff", AsyncMock(return_value=cost_by_tariff)),
        patch.object(exporter, "_get_production_statistics", AsyncMock(return_value=[])),
        patch.object(exporter, "_import_stats_in_chunks", side_effect=fake_import_chunks),
        patch.object(exporter, "clear_statistics", AsyncMock(return_value={"success": True})),
    ):
        result = await exporter.import_statistics(MagicMock(), ["12345678901234"], clear_first=False)

    assert result["success"] is True

    # Vérifier que les métadonnées contiennent à la fois :
    # 1. La statistique externe myelectricaldata:cost_12345678901234_base (source="myelectricaldata")
    # 2. La statistique d'entité tarifaire sensor.linky_12345678901234_cost_base (source="recorder")
    # 3. La statistique d'entité globale sensor.linky_12345678901234_cost (source="recorder")
    stat_ids = {c["statistic_id"]: c["source"] for c in imported_stats_calls}
    assert stat_ids.get("myelectricaldata:cost_12345678901234_base") == "myelectricaldata"
    assert stat_ids.get("sensor.linky_12345678901234_cost_base") == "recorder"
    assert stat_ids.get("sensor.linky_12345678901234_cost") == "recorder"

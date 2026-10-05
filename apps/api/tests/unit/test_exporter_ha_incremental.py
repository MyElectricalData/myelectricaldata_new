"""Import incrémental des statistiques Home Assistant : continuité des sommes (MED-18, PR #111)

En mode incrémental, les séries cumulées repartaient de 0 (delta négatif géant dans le panneau
Énergie) et les heures déjà exportées d'un tarif étaient réimportées dès qu'un autre tarif avait une
dernière date plus ancienne (double comptage). Une série sans point sur les 30 derniers jours
(TEMPO rouge d'avril à octobre) perdait en plus sa dernière somme.
"""

import json
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

from src.models.tempo_day import TempoColor
from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.tariff import TariffProfile

PARIS = ZoneInfo("Europe/Paris")
PREFIX = "med"
PDL = "12345678901234"


def paris(day: date, hour: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, tzinfo=PARIS)


def ms(dt: datetime) -> float:
    """HA (core 2023+) rend `start` et `end` en millisecondes depuis l'epoch"""
    return dt.timestamp() * 1000


def make_exporter() -> HomeAssistantExporter:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {"statistic_id_prefix": PREFIX, "ha_token": "token"}
    exporter.prefix = PREFIX
    return exporter


def result_of(rows: list[Any]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    return result


def fake_db(*queries: list[Any]) -> MagicMock:
    """execute() rend les lignes de chaque requête, dans l'ordre où le builder les pose"""
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[result_of(rows) for rows in queries])
    return db


def slot(day: date, hour: int, wh: float) -> SimpleNamespace:
    """Relevé détaillé 30 min : W moyens sur le pas, soit Wh × 2 (pas PT30M par défaut)"""
    return SimpleNamespace(date=day, interval_start=f"{hour:02d}:00", value=int(wh * 2), raw_data=None)


def by_tag(stats: dict[str, list[dict[str, Any]]]) -> dict[str, list[tuple[str, float]]]:
    return {tag: [(s["start"][:13], s["sum"]) for s in rows] for tag, rows in stats.items() if rows}


OCT_5, OCT_6, NOV_3 = date(2026, 10, 5), date(2026, 10, 6), date(2026, 11, 3)


# =============================================================================
# get_last_statistic_dates : dernières dates ET dernières sommes
# =============================================================================


def ha_exporter(statistic_ids: list[str], hourly: dict[str, list[dict[str, Any]]],
                monthly: dict[str, list[dict[str, Any]]] | None = None) -> tuple[HomeAssistantExporter, list[dict[str, Any]]]:
    """Exporteur branché sur un faux HA : `hourly` et `monthly` répondent selon `period`, en ne gardant que
    les lignes à partir de `start_time` (comme HA) ; rend aussi la liste des messages envoyés"""
    exporter = make_exporter()
    exporter._has_websocket_config = MagicMock(return_value=True)  # type: ignore[method-assign]
    exporter.list_statistics = AsyncMock(return_value={"success": True, "statistic_ids": statistic_ids})  # type: ignore[method-assign]

    @asynccontextmanager
    async def connect():  # type: ignore[no-untyped-def]
        ws = MagicMock()
        ws.recv = AsyncMock(side_effect=[json.dumps({"type": "auth_required"}), json.dumps({"type": "auth_ok"})])
        ws.send = AsyncMock()
        yield ws

    exporter._ws_connect = connect  # type: ignore[method-assign,assignment]
    sent: list[dict[str, Any]] = []

    async def send_and_receive(ws: Any, message: dict[str, Any], msg_id: int, timeout: int = 300) -> dict[str, Any]:
        sent.append(message)
        data = (monthly if message.get("period") == "month" else hourly) or {}
        wanted = message.get("statistic_ids", [])
        since = ms(datetime.fromisoformat(message["start_time"]))
        rows = {k: [r for r in v if r["start"] >= since] for k, v in data.items() if k in wanted}
        return {"id": msg_id, "success": True, "result": {k: v for k, v in rows.items() if v}}

    exporter._ws_send_and_receive = send_and_receive  # type: ignore[method-assign,assignment]
    return exporter, sent


def hour_row(start: datetime, total: float) -> dict[str, Any]:
    return {"start": ms(start), "end": ms(start) + 3_600_000, "state": None, "sum": total}


async def test_last_dates_parsed_from_milliseconds() -> None:
    """Garde-fou (bug 1, déjà corrigé par MED-10) : `start` en ms ne fait plus planter le parsing"""
    stat_id = f"{PREFIX}:consumption_{PDL}_base"
    exporter, _ = ha_exporter([stat_id], {stat_id: [hour_row(paris(OCT_5, 9), 100.0)]})
    result = await exporter.get_last_statistic_dates()
    assert result["success"] is True
    assert datetime.fromisoformat(result["last_dates"][stat_id]) == paris(OCT_5, 9)


async def test_last_sums_returned_with_last_dates() -> None:
    """Bug 2 : la dernière somme de chaque série sert de point de départ en incrémental"""
    hp, hc = f"{PREFIX}:consumption_{PDL}_hp", f"{PREFIX}:consumption_{PDL}_hc"
    exporter, _ = ha_exporter([hp, hc], {
        hp: [hour_row(paris(OCT_5, 9), 90.5), hour_row(paris(OCT_5, 10), 91.25)],
        hc: [hour_row(paris(OCT_5, 2), 40.0)],
    })
    result = await exporter.get_last_statistic_dates()
    assert result["last_sums"] == {hp: 91.25, hc: 40.0}


async def test_series_absent_from_window_keeps_its_exact_last_hour_and_sum() -> None:
    """TEMPO rouge en octobre (ou PDL dont la synchro s'est arrêtée) : aucun point sur 30 jours. Le
    dernier mois est trouvé sur l'historique mensuel, puis la dernière heure exacte et sa somme dessus.
    Elle compte dans oldest_date : sinon les heures entre sa dernière date et celle des autres séries ne
    seraient jamais relues par la requête SQL (le filtre par tarif évite le double comptage)"""
    blue, red = f"{PREFIX}:consumption_{PDL}_blue_hp", f"{PREFIX}:consumption_{PDL}_red_hp"
    march, april = datetime(2026, 3, 1, tzinfo=PARIS), datetime(2026, 4, 1, tzinfo=PARIS)
    last_red_hour = datetime(2026, 3, 31, 21, tzinfo=PARIS)
    exporter, sent = ha_exporter(
        [blue, red],
        hourly={
            blue: [hour_row(paris(OCT_5, 21), 1200.0)],
            red: [hour_row(datetime(2026, 3, 31, 20, tzinfo=PARIS), 499.0), hour_row(last_red_hour, 500.0)],
        },
        monthly={red: [
            {"start": ms(datetime(2026, 2, 1, tzinfo=PARIS)), "end": ms(march), "sum": 420.0},
            {"start": ms(march), "end": ms(april), "sum": 500.0},
        ]},
    )
    result = await exporter.get_last_statistic_dates()

    assert [m["statistic_ids"] for m in sent if m.get("period") == "month"] == [[red]]
    assert result["last_sums"] == {blue: 1200.0, red: 500.0}
    assert datetime.fromisoformat(result["last_dates"][red]) == last_red_hour
    assert datetime.fromisoformat(result["oldest_date"]) == last_red_hour


async def test_series_without_any_history_stays_unknown() -> None:
    """Série créée vide (production sans panneau) : ni date ni somme, elle repart de 0"""
    base, production = f"{PREFIX}:consumption_{PDL}_base", f"{PREFIX}:production_{PDL}"
    exporter, _ = ha_exporter([base, production], {base: [hour_row(paris(OCT_5, 9), 100.0)]})
    result = await exporter.get_last_statistic_dates()
    assert result["last_sums"] == {base: 100.0}
    assert set(result["last_dates"]) == {base}


async def test_no_monthly_request_when_every_series_is_in_window() -> None:
    stat_id = f"{PREFIX}:consumption_{PDL}_base"
    exporter, sent = ha_exporter([stat_id], {stat_id: [hour_row(paris(OCT_5, 9), 100.0)]})
    await exporter.get_last_statistic_dates()
    assert [m.get("period") for m in sent] == ["hour"]


# =============================================================================
# _extract_per_pdl_state : répartition des sommes et dates par catégorie
# =============================================================================


def test_extract_per_pdl_state_splits_by_category() -> None:
    other_pdl = "99999999999999"
    sums = {
        f"{PREFIX}:consumption_{PDL}_hp": 91.25,
        f"{PREFIX}:consumption_{PDL}_hc": 40.0,
        f"{PREFIX}:cost_{PDL}_hp": 22.5,
        f"{PREFIX}:production_{PDL}": 12.0,
        f"{PREFIX}:consumption_{other_pdl}_hp": 1.0,
    }
    dates = {
        f"{PREFIX}:consumption_{PDL}_hp": paris(OCT_5, 10).isoformat(),
        f"{PREFIX}:consumption_{PDL}_hc": paris(OCT_5, 2).isoformat(),
        f"{PREFIX}:production_{PDL}": paris(OCT_5, 12).isoformat(),
        f"{PREFIX}:consumption_{other_pdl}_hp": paris(OCT_6, 10).isoformat(),
    }
    consumption, cost, production, last_consumption, last_production = HomeAssistantExporter._extract_per_pdl_state(
        PREFIX, PDL, sums, dates
    )
    assert consumption == {"hp": 91.25, "hc": 40.0}
    assert cost == {"hp": 22.5}
    assert production == 12.0
    assert last_consumption == {"hp": paris(OCT_5, 10), "hc": paris(OCT_5, 2)}
    assert last_production == paris(OCT_5, 12)


def test_extract_per_pdl_state_without_history() -> None:
    assert HomeAssistantExporter._extract_per_pdl_state(PREFIX, PDL, {}, {}) == ({}, {}, 0.0, {}, None)


# =============================================================================
# Consommation : sommes reprises et filtre par tarif
# =============================================================================


def consumption_exporter(profile: TariffProfile) -> HomeAssistantExporter:
    exporter = make_exporter()
    exporter._get_pdl_contract_info = AsyncMock(return_value=(profile, None, None))  # type: ignore[method-assign]
    return exporter


async def test_full_import_sums_start_at_zero() -> None:
    """Garde-fou : sans état HA (import complet), la série part de 0"""
    exporter = consumption_exporter(TariffProfile("BASE"))
    stats = await exporter._get_consumption_statistics_by_tariff(
        fake_db([slot(OCT_5, 9, 1000), slot(OCT_5, 10, 500)]), PDL
    )
    assert by_tag(stats) == {"base": [("2026-10-05T09", 1.0), ("2026-10-05T10", 1.5)]}


async def test_incremental_consumption_continues_the_ha_sum() -> None:
    """Bug 2 : la série reprend à la dernière somme connue de HA, au lieu de repartir de 0"""
    exporter = consumption_exporter(TariffProfile("BASE"))
    stats = await exporter._get_consumption_statistics_by_tariff(
        fake_db([slot(OCT_5, 10, 500)]), PDL, paris(OCT_5, 9),
        initial_sums={"base": 100.0}, last_dates_by_tariff={"base": paris(OCT_5, 9)},
    )
    assert by_tag(stats) == {"base": [("2026-10-05T10", 100.5)]}


async def test_incremental_consumption_skips_hours_already_in_ha_per_tariff() -> None:
    """Bug 3 : since_date est la plus ancienne des dernières dates (ici hp). Les heures hc déjà
    exportées sont relues par la requête SQL mais ne doivent pas être réimportées"""
    exporter = consumption_exporter(TariffProfile("HC_HP"))
    records = [slot(OCT_5, 2, 1000), slot(OCT_5, 10, 2000), slot(OCT_6, 2, 1000), slot(OCT_6, 10, 2000)]
    stats = await exporter._get_consumption_statistics_by_tariff(
        fake_db(records), PDL, paris(OCT_5, 10),
        initial_sums={"hc": 40.0, "hp": 90.0},
        last_dates_by_tariff={"hc": paris(OCT_6, 2), "hp": paris(OCT_5, 10)},
    )
    assert by_tag(stats) == {"hp": [("2026-10-06T10", 92.0)]}


async def test_tempo_red_resumes_from_its_last_winter_sum() -> None:
    """Premier jour rouge de novembre : la série rouge reprend à sa somme de fin d'hiver"""
    exporter = consumption_exporter(TariffProfile("TEMPO"))
    tempo_days = [SimpleNamespace(date=NOV_3, color=TempoColor.RED)]
    last_red_hour = datetime(2026, 3, 31, 21, tzinfo=PARIS)
    stats = await exporter._get_consumption_statistics_by_tariff(
        fake_db([slot(NOV_3, 10, 3000)], tempo_days), PDL, last_red_hour,
        initial_sums={"blue_hp": 1200.0, "red_hp": 500.0},
        last_dates_by_tariff={"blue_hp": paris(OCT_5, 21), "red_hp": last_red_hour},
    )
    assert by_tag(stats) == {"red_hp": [("2026-11-03T10", 503.0)]}


# =============================================================================
# Coût : sommes reprises
# =============================================================================


def offer_db(offer_type: str, **prices: str) -> MagicMock:
    """execute() rend le PDL (avec offre choisie) puis l'offre, ordre de _get_cost_statistics_by_tariff"""
    fields: dict[str, Any] = dict.fromkeys((
        "base_price", "hc_price", "hp_price",
        "base_price_weekend", "hc_price_weekend", "hp_price_weekend",
        "hc_price_winter", "hp_price_winter", "hc_price_summer", "hp_price_summer",
        "tempo_blue_hc", "tempo_blue_hp", "tempo_white_hc", "tempo_white_hp", "tempo_red_hc", "tempo_red_hp",
    ))
    fields.update({k: Decimal(v) for k, v in prices.items()})
    results = []
    for row in (SimpleNamespace(selected_offer_id="offre-1"),
                SimpleNamespace(name=f"Offre {offer_type}", offer_type=offer_type, **fields)):
        result = MagicMock()
        result.scalar_one_or_none.return_value = row
        results.append(result)
    db = MagicMock()
    db.execute = AsyncMock(side_effect=results)
    return db


async def test_incremental_cost_continues_the_ha_sum() -> None:
    exporter = make_exporter()
    consumption = {"hp": [{"start": paris(OCT_6, 10).isoformat(), "state": 2.0, "sum": 92.0}]}
    stats = await exporter._get_cost_statistics_by_tariff(
        offer_db("HC_HP", hc_price="0.20", hp_price="0.25"), PDL, consumption, initial_sums={"hp": 22.5}
    )
    assert by_tag(stats) == {"hp": [("2026-10-06T10", 23.0)]}


# =============================================================================
# Production : somme reprise et heures déjà exportées ignorées
# =============================================================================


async def test_incremental_production_continues_and_skips_exported_hours() -> None:
    exporter = make_exporter()
    stats = await exporter._get_production_statistics(
        fake_db([slot(OCT_5, 12, 800), slot(OCT_5, 13, 600)]), PDL, paris(OCT_5, 12),
        initial_sum=12.0, last_date=paris(OCT_5, 12),
    )
    assert [(s["start"][:13], s["sum"]) for s in stats] == [("2026-10-05T13", 12.6)]

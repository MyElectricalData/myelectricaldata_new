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

import pytest

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


OCT_4, OCT_5, OCT_6, NOV_3 = date(2026, 10, 4), date(2026, 10, 5), date(2026, 10, 6), date(2026, 11, 3)
NOW = datetime(2026, 10, 6, 12, tzinfo=PARIS)  # horloge figée : la fenêtre de 30 jours en dépend


# =============================================================================
# get_last_statistic_dates : dernières dates ET dernières sommes
# =============================================================================


def ha_exporter(statistic_ids: list[str], hourly: dict[str, list[dict[str, Any]]],
                monthly: dict[str, list[dict[str, Any]]] | None = None,
                failing_period: str | None = None) -> tuple[HomeAssistantExporter, list[dict[str, Any]]]:
    """Exporteur branché sur un faux HA : `hourly` et `monthly` répondent selon `period`, en ne gardant que
    les lignes à partir de `start_time` (comme HA) ; `failing_period` fait échouer les requêtes de cette
    période ; rend aussi la liste des messages envoyés"""
    exporter = make_exporter()
    exporter._now = lambda: NOW  # type: ignore[method-assign]
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
        if message.get("period") == failing_period:
            return {"success": False, "error": {"message": "Timeout après 300s"}}
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


async def test_failed_lookup_beyond_window_is_an_error() -> None:
    """I2 : sans la somme de la série rouge, elle repartirait de 0 au premier jour rouge. La lecture
    échoue donc plutôt que de rendre un état incomplet"""
    blue, red = f"{PREFIX}:consumption_{PDL}_blue_hp", f"{PREFIX}:consumption_{PDL}_red_hp"
    exporter, _ = ha_exporter([blue, red], {blue: [hour_row(paris(OCT_5, 21), 1200.0)]}, failing_period="month")
    result = await exporter.get_last_statistic_dates()
    assert result["success"] is False
    assert result["last_sums"] == {}


async def test_lookup_limited_to_the_imported_pdls() -> None:
    """I4 : la série figée d'un autre PDL (retiré de l'export) n'est ni cherchée hors fenêtre ni comptée"""
    other_pdl = "99999999999999"
    base, stale = f"{PREFIX}:consumption_{PDL}_base", f"{PREFIX}:consumption_{other_pdl}_base"
    exporter, sent = ha_exporter(
        [base, stale],
        hourly={base: [hour_row(paris(OCT_5, 9), 100.0)], stale: [hour_row(datetime(2024, 6, 30, 23, tzinfo=PARIS), 5.0)]},
        monthly={stale: [{"start": ms(datetime(2024, 6, 1, tzinfo=PARIS)), "end": 0, "sum": 5.0}]},
    )
    result = await exporter.get_last_statistic_dates(usage_point_ids=[PDL])
    assert set(result["last_dates"]) == {base}
    assert all(m["statistic_ids"] == [base] for m in sent)
    assert datetime.fromisoformat(result["oldest_date"]) == paris(OCT_5, 9)


async def test_resume_point_without_sum_is_a_read_failure() -> None:
    """M3 : une ligne HA sans somme ferait repartir la série de 0 : la lecture échoue plutôt"""
    stat_id = f"{PREFIX}:consumption_{PDL}_base"
    row = hour_row(paris(OCT_5, 9), 100.0)
    row["sum"] = None
    exporter, _ = ha_exporter([stat_id], {stat_id: [row]})
    result = await exporter.get_last_statistic_dates()
    assert result["success"] is False


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
        f"{PREFIX}:cost_{PDL}_hp": paris(OCT_4, 10).isoformat(),
        f"{PREFIX}:production_{PDL}": paris(OCT_5, 12).isoformat(),
        f"{PREFIX}:consumption_{other_pdl}_hp": paris(OCT_6, 10).isoformat(),
    }
    state = HomeAssistantExporter._extract_per_pdl_state(PREFIX, PDL, sums, dates)
    consumption, cost, production, last_consumption, last_cost, last_production = state
    assert consumption == {"hp": 91.25, "hc": 40.0}
    assert cost == {"hp": 22.5}
    assert production == 12.0
    assert last_consumption == {"hp": paris(OCT_5, 10), "hc": paris(OCT_5, 2)}
    assert last_cost == {"hp": paris(OCT_4, 10)}
    assert last_production == paris(OCT_5, 12)


def test_extract_per_pdl_state_without_history() -> None:
    assert HomeAssistantExporter._extract_per_pdl_state(PREFIX, PDL, {}, {}) == ({}, {}, 0.0, {}, {}, None)


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


async def test_tempo_export_stops_after_the_last_known_color() -> None:
    """M1 : un jour postérieur au dernier jour connu du calendrier (couleur pas encore publiée) partait en
    bleu, puis était recompté dans sa vraie couleur. L'export s'arrête à sa première heure : aucune série
    ne le dépasse, sa couleur connue au prochain import le range au bon endroit"""
    exporter = consumption_exporter(TariffProfile("TEMPO"))
    nov_4, nov_5 = date(2026, 11, 4), date(2026, 11, 5)
    tempo_days = [SimpleNamespace(date=NOV_3, color=TempoColor.RED)]
    records = [slot(NOV_3, 10, 1000), slot(nov_4, 2, 1000), slot(nov_4, 10, 1000), slot(nov_5, 10, 1000)]
    stats = await exporter._get_consumption_statistics_by_tariff(fake_db(records, tempo_days), PDL)
    # 4 nov 2h : heure creuse rattachée au 3 (rouge), connue ; 4 nov 10h : pas encore publiée, arrêt
    assert by_tag(stats) == {"red_hp": [("2026-11-03T10", 1.0)], "red_hc": [("2026-11-04T02", 1.0)]}


async def test_tempo_hole_inside_the_calendar_is_blue_with_a_warning() -> None:
    """I3 (2e revue) : un jour manquant AU MILIEU du calendrier (client éteint, la synchro ne rattrape que
    la saison courante) ne sera jamais comblé : s'y arrêter gèlerait tout l'export. Il passe en bleu,
    avec un avertissement remonté dans le résultat de l'import"""
    exporter = consumption_exporter(TariffProfile("TEMPO"))
    exporter._export_warnings = []
    nov_4, nov_5 = date(2026, 11, 4), date(2026, 11, 5)
    tempo_days = [SimpleNamespace(date=NOV_3, color=TempoColor.RED), SimpleNamespace(date=nov_5, color=TempoColor.WHITE)]
    records = [slot(nov_4, 10, 1000), slot(nov_5, 10, 1000)]
    stats = await exporter._get_consumption_statistics_by_tariff(fake_db(records, tempo_days), PDL)
    assert by_tag(stats) == {"blue_hp": [("2026-11-04T10", 1.0)], "white_hp": [("2026-11-05T10", 1.0)]}
    assert any("2026-11-04" in warning for warning in exporter._export_warnings)


async def test_tempo_history_before_the_calendar_stays_blue() -> None:
    """Garde-fou : une conso antérieure au premier jour du calendrier Tempo connu reste en bleu, comme
    avant ; seul un jour manquant APRÈS son début arrête l'export (sinon un historique plus ancien que
    le calendrier n'exporterait plus rien)"""
    exporter = consumption_exporter(TariffProfile("TEMPO"))
    oct_1 = date(2026, 10, 1)
    stats = await exporter._get_consumption_statistics_by_tariff(
        fake_db([slot(oct_1, 10, 1000), slot(NOV_3, 10, 1000)], [SimpleNamespace(date=NOV_3, color=TempoColor.RED)]), PDL
    )
    assert by_tag(stats) == {"blue_hp": [("2026-10-01T10", 1.0)], "red_hp": [("2026-11-03T10", 1.0)]}


async def test_resume_points_parsed_from_ha_compare_in_utc() -> None:
    """En production les points de reprise viennent de fromisoformat (offset fixe, comparaison en UTC) et
    non d'un ZoneInfo : même résultat, y compris à l'heure du changement d'heure d'octobre"""
    exporter = consumption_exporter(TariffProfile("BASE"))
    oct_25 = date(2026, 10, 25)
    resume = datetime.fromisoformat(paris(oct_25, 1).isoformat())  # 01:00+02:00
    stats = await exporter._get_consumption_statistics_by_tariff(
        fake_db([slot(oct_25, 1, 1000), slot(oct_25, 2, 1000), slot(oct_25, 3, 1000)]), PDL, resume,
        initial_sums={"base": 10.0}, last_dates_by_tariff={"base": resume},
    )
    assert by_tag(stats) == {"base": [("2026-10-25T02", 11.0), ("2026-10-25T03", 12.0)]}


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


def consumption_hours(*days: date) -> dict[str, list[dict[str, Any]]]:
    """Conso NON filtrée de 2 kWh à 10h chaque jour (ce que le coût reçoit)"""
    return {"hp": [{"start": paris(day, 10).isoformat(), "state": 2.0, "sum": 0.0} for day in days]}


async def test_cost_behind_consumption_resumes_from_its_own_point() -> None:
    """I1 : le coût s'est arrêté au 4 (import interrompu, jour Zen Flex rattrapé, offre choisie après
    coup) alors que la conso est au 5. Le 5 doit être chiffré, sinon il manque pour toujours"""
    exporter = make_exporter()
    stats = await exporter._get_cost_statistics_by_tariff(
        offer_db("HC_HP", hc_price="0.20", hp_price="0.25"), PDL, consumption_hours(OCT_4, OCT_5, OCT_6),
        initial_sums={"hp": 0.5}, last_dates_by_tariff={"hp": paris(OCT_4, 10)},
    )
    assert by_tag(stats) == {"hp": [("2026-10-05T10", 1.0), ("2026-10-06T10", 1.5)]}


async def test_cost_ahead_of_consumption_is_not_counted_twice() -> None:
    """I1 : le coût est déjà au 5 alors que la conso n'y est pas (import de conso échoué) : le 5 n'est
    pas rechiffré"""
    exporter = make_exporter()
    stats = await exporter._get_cost_statistics_by_tariff(
        offer_db("HC_HP", hc_price="0.20", hp_price="0.25"), PDL, consumption_hours(OCT_4, OCT_5, OCT_6),
        initial_sums={"hp": 1.0}, last_dates_by_tariff={"hp": paris(OCT_5, 10)},
    )
    assert by_tag(stats) == {"hp": [("2026-10-06T10", 1.5)]}


async def test_zen_flex_cost_stops_at_a_day_missing_after_the_calendar_start() -> None:
    """Un jour absent du calendrier APRÈS son premier jour connu est en cours de rattrapage : le coût s'y
    arrête (sinon il serait sauté pour toujours). Les jours d'avant le lancement restent sans coût"""
    from src.models.zen_flex_day import ZenFlexDayType

    exporter = make_exporter()
    jan_15, jan_16, jan_19 = date(2026, 1, 15), date(2026, 1, 16), date(2026, 1, 19)
    exporter._get_zen_flex_days = AsyncMock(  # type: ignore[method-assign]
        return_value={jan_15: ZenFlexDayType.SOBRIETE, jan_19: ZenFlexDayType.BONUS}
    )
    zen_flex = offer_db(
        "ZEN_FLEX", hc_price_winter="0.1519", hp_price_winter="0.2091", hc_price_summer="0.2091", hp_price_summer="0.7253"
    )
    stats = await exporter._get_cost_statistics_by_tariff(
        zen_flex, PDL, {"hp": [{"start": paris(d, 10).isoformat(), "state": 1.0, "sum": 0.0} for d in (jan_15, jan_16, jan_19)]}
    )
    assert by_tag(stats) == {"hp": [("2026-01-15T10", 0.7253)]}


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


# =============================================================================
# Câblage de import_statistics et import_statistics_with_progress
# =============================================================================

OTHER_PDL = "99999999999999"


def base_hours(*slots: tuple[date, int]) -> list[dict[str, Any]]:
    """Série de conso telle que la rend le builder sans filtre : 1 kWh par heure, somme cumulée depuis 0"""
    return [{"start": paris(day, hour).isoformat(), "state": 1.0, "sum": float(i)} for i, (day, hour) in enumerate(slots, 1)]


def import_exporter(state: dict[str, Any]) -> tuple[HomeAssistantExporter, dict[str, list[dict[str, Any]]]]:
    """Exporteur dont la lecture HA rend `state`, les builders sont des doublures (conso BASE non filtrée)
    et les imports sont capturés par statistic_id"""
    exporter = make_exporter()
    exporter._has_websocket_config = MagicMock(return_value=True)  # type: ignore[method-assign]
    exporter.get_last_statistic_dates = AsyncMock(return_value=state)  # type: ignore[method-assign]
    exporter.clear_statistics = AsyncMock(return_value={"success": True})  # type: ignore[method-assign]
    exporter._get_pdl_contract_info = AsyncMock(return_value=(TariffProfile("BASE"), None, None))  # type: ignore[method-assign]
    hours_by_pdl = {
        PDL: {"base": base_hours((OCT_4, 9), (OCT_5, 9), (OCT_5, 10))},
        OTHER_PDL: {"base": base_hours((OCT_5, 10))},
    }
    exporter._get_consumption_statistics_by_tariff = AsyncMock(  # type: ignore[method-assign]
        side_effect=lambda db, pdl, since=None, **kwargs: hours_by_pdl[pdl]
    )
    exporter._get_cost_statistics_by_tariff = AsyncMock(return_value={})  # type: ignore[method-assign]
    exporter._get_production_statistics = AsyncMock(return_value=[])  # type: ignore[method-assign]

    @asynccontextmanager
    async def connect():  # type: ignore[no-untyped-def]
        ws = MagicMock()
        ws.recv = AsyncMock(side_effect=[json.dumps({"type": "auth_required"}), json.dumps({"type": "auth_ok"})])
        ws.send = AsyncMock()
        yield ws

    exporter._ws_connect = connect  # type: ignore[method-assign,assignment]
    imported: dict[str, list[dict[str, Any]]] = {}

    async def import_chunks(ws: Any, stats: list[dict[str, Any]], metadata: dict[str, Any], msg_id_start: int,
                            **kwargs: Any) -> tuple[int, int, list[str]]:
        imported[metadata["statistic_id"]] = stats
        return len(stats), msg_id_start + 1, []

    exporter._import_stats_in_chunks = import_chunks  # type: ignore[method-assign,assignment]
    return exporter, imported


async def run_import(exporter: HomeAssistantExporter, with_progress: bool, clear_first: bool = False) -> dict[str, Any]:
    db = MagicMock()
    if with_progress:
        return await exporter.import_statistics_with_progress(db, [PDL, OTHER_PDL], clear_first=clear_first, incremental=True)
    return await exporter.import_statistics(db, [PDL, OTHER_PDL], clear_first=clear_first, incremental=True)


INCREMENTAL_STATE = {
    "success": True,
    "message": "",
    "oldest_date": datetime(2024, 1, 1, tzinfo=PARIS).isoformat(),
    "last_dates": {
        f"{PREFIX}:consumption_{PDL}_base": paris(OCT_5, 9).isoformat(),
        f"{PREFIX}:cost_{PDL}_base": paris(OCT_4, 9).isoformat(),
        f"{PREFIX}:production_{PDL}": paris(OCT_5, 9).isoformat(),
        # ancien profil HC/HP de ce PDL, figé : ne doit pas faire relire la base depuis 2024
        f"{PREFIX}:consumption_{PDL}_hc": datetime(2024, 1, 1, tzinfo=PARIS).isoformat(),
        f"{PREFIX}:consumption_{OTHER_PDL}_base": paris(OCT_5, 9).isoformat(),
    },
    "last_sums": {
        f"{PREFIX}:consumption_{PDL}_base": 100.0,
        f"{PREFIX}:cost_{PDL}_base": 20.0,
        f"{PREFIX}:production_{PDL}": 5.0,
        f"{PREFIX}:consumption_{PDL}_hc": 7.0,
        f"{PREFIX}:consumption_{OTHER_PDL}_base": 50.0,
    },
}


@pytest.mark.parametrize("with_progress", [False, True], ids=["import_statistics", "with_progress"])
async def test_incremental_import_wiring(with_progress: bool) -> None:
    exporter, imported = import_exporter(INCREMENTAL_STATE)
    result = await run_import(exporter, with_progress)
    assert result["success"] is True

    # Lecture HA limitée aux PDL importés
    exporter.get_last_statistic_dates.assert_awaited_once_with(usage_point_ids=[PDL, OTHER_PDL])  # type: ignore[attr-defined]

    # since par PDL : le plus ancien point de reprise de SES séries du profil actuel (coût du 4 à 9h),
    # sans l'ancienne série hc de 2024 ni les séries de l'autre PDL
    consumption_calls = exporter._get_consumption_statistics_by_tariff.await_args_list  # type: ignore[attr-defined]
    since_by_pdl = {c.args[1]: c.args[2] for c in consumption_calls}
    assert since_by_pdl == {PDL: paris(OCT_4, 9), OTHER_PDL: paris(OCT_5, 9)}
    assert all(not c.kwargs for c in consumption_calls)  # conso lue SANS filtre

    # Conso émise : prolonge la somme HA après son point de reprise
    assert [(s["start"][:13], s["sum"]) for s in imported[f"{PREFIX}:consumption_{PDL}_base"]] == [("2026-10-05T10", 101.0)]
    assert [(s["start"][:13], s["sum"]) for s in imported[f"{PREFIX}:consumption_{OTHER_PDL}_base"]] == [("2026-10-05T10", 51.0)]

    # Coût : conso non filtrée, et SON point de reprise
    cost_call = next(c for c in exporter._get_cost_statistics_by_tariff.await_args_list if c.args[1] == PDL)  # type: ignore[attr-defined]
    assert len(cost_call.args[2]["base"]) == 3
    assert cost_call.kwargs == {"initial_sums": {"base": 20.0}, "last_dates_by_tariff": {"base": paris(OCT_4, 9)}}

    # Production : sa somme et sa date
    production_call = next(c for c in exporter._get_production_statistics.await_args_list if c.args[1] == PDL)  # type: ignore[attr-defined]
    assert production_call.kwargs == {"initial_sum": 5.0, "last_date": paris(OCT_5, 9)}


@pytest.mark.parametrize("with_progress", [False, True], ids=["import_statistics", "with_progress"])
async def test_incremental_import_stops_when_ha_state_is_unreadable(with_progress: bool) -> None:
    """I2 : état HA illisible en différentiel : erreur, sans repli sur un import complet qui réécrirait
    tout depuis 0 par-dessus les séries existantes"""
    exporter, imported = import_exporter({"success": False, "message": "Timeout après 300s", "last_dates": {},
                                          "last_sums": {}, "oldest_date": None})
    result = await run_import(exporter, with_progress)
    assert result["success"] is False
    assert "Timeout" in result["message"]
    assert imported == {}
    exporter._get_consumption_statistics_by_tariff.assert_not_awaited()  # type: ignore[attr-defined]


@pytest.mark.parametrize("with_progress", [False, True], ids=["import_statistics", "with_progress"])
async def test_incremental_without_any_statistic_falls_back_to_full_import(with_progress: bool) -> None:
    exporter, imported = import_exporter({"success": True, "message": "", "last_dates": {}, "last_sums": {},
                                          "oldest_date": None})
    # clear_first vaut True par défaut dans l'API : le repli ne doit rien supprimer (séries d'autres PDL)
    await run_import(exporter, with_progress, clear_first=True)
    exporter.clear_statistics.assert_not_awaited()  # type: ignore[attr-defined]
    since_by_pdl = {c.args[1]: c.args[2] for c in exporter._get_consumption_statistics_by_tariff.await_args_list}  # type: ignore[attr-defined]
    assert since_by_pdl == {PDL: None, OTHER_PDL: None}
    assert [s["sum"] for s in imported[f"{PREFIX}:consumption_{PDL}_base"]] == [1.0, 2.0, 3.0]

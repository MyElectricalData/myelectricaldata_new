"""Cohérence de la PR #125 (coûts, Pmax) avec les conventions de main 2.13.x (MED-100)

Ces tests décrivent ce que la fusion doit respecter : une seule définition par méthode, noms
d'entités passant par `entity_language` (#172), unique_id/entity_id stables entre fr et en,
et capteurs de coût cohérents entre eux (HP + HC = total, MED-93).
"""

import ast
import inspect
import json
from collections import Counter
from datetime import date, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.services.exporters import home_assistant as ha_module
from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.tariff import TariffProfile

PDL = "12345678901234"


def exporter(language: str | None = None) -> HomeAssistantExporter:
    config: dict[str, Any] = {"mqtt_broker": "mqtt.local"}
    if language is not None:
        config["entity_language"] = language
    return HomeAssistantExporter(config)


def discovery_configs(client: MagicMock) -> list[dict[str, Any]]:
    """Payloads Discovery (topics .../config) réellement publiés sur le faux client MQTT"""
    return [
        json.loads(c.kwargs["payload"])
        for c in client.publish.await_args_list
        if c.args[0].endswith("/config") and c.kwargs.get("payload")
    ]


def uid(config: dict[str, Any]) -> str:
    """Identifiant unique d'un payload Discovery (capteur : uniq_id, binary_sensor : unique_id)"""
    return str(config.get("uniq_id") or config.get("unique_id"))


def fake_client() -> MagicMock:
    client = MagicMock()
    client.publish = AsyncMock()
    return client


def fake_stats(day_wh: float = 10000) -> MagicMock:
    stats = MagicMock()
    stats.get_day_total = AsyncMock(return_value=day_wh)
    # La version de main de _export_production_stats vérifie has_production via stats.db
    stats.db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=True)))
    return stats


def test_methodes_de_l_exporter_definies_une_seule_fois() -> None:
    """Une seconde définition masque la première sans erreur (ni ruff, ni Python)"""
    tree = ast.parse(inspect.getsource(ha_module))
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "HomeAssistantExporter")
    names = Counter(n.name for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)))
    assert {name: n for name, n in names.items() if n > 1} == {}


@pytest.mark.parametrize(
    ("method", "expected_fr", "expected_en"),
    [
        ("_export_consumption_stats", "Consommation 7 derniers jours", "consumption last7day"),
        ("_export_production_stats", "Production 7 derniers jours", "production last7day"),
    ],
)
async def test_stats_glissantes_suivent_entity_language(method: str, expected_fr: str, expected_en: str) -> None:
    """Chemin réel de l'export (include_main=False) : le nom doit venir de entity_language"""
    for language, expected in (("fr", expected_fr), ("en", expected_en)):
        client = fake_client()
        exp = exporter(language)
        await getattr(exp, method)(client, fake_stats(), PDL, include_main=False)
        names = [c["name"] for c in discovery_configs(client)]
        assert expected in names, f"{language}: {names}"


async def run_cost_and_max_power(language: str) -> list[dict[str, Any]]:
    exp = exporter(language)
    client = fake_client()
    stats = fake_stats()
    stats.get_max_power_history = AsyncMock(
        return_value={__import__("datetime").date.today() - __import__("datetime").timedelta(days=1): {"va": 5200, "kva": 5.2, "time": "18:30:00"}}
    )
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=6)))
    with (
        patch.object(exp, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("HC_HP"), [], 6))),
        patch.object(exp, "_get_pdl_prices", AsyncMock(return_value={"hp": 0.25, "hc": 0.15})),
        patch.object(
            exp, "_get_hp_hc_summary", AsyncMock(return_value={"yesterday_hp_kwh": 8.0, "yesterday_hc_kwh": 2.0})
        ),
    ):
        await exp._export_cost_sensors(client, stats, db, PDL)
        await exp._export_max_power_sensor(client, stats, db, PDL)
    return discovery_configs(client)


async def test_capteurs_cout_et_pmax_ont_un_nom_localise_et_des_identifiants_stables() -> None:
    fr = await run_cost_and_max_power("fr")
    en = await run_cost_and_max_power("en")

    # Les capteurs attendus sont bien publiés (garde contre une preuve à vide)
    assert len(fr) == len(en) >= 5
    # Identifiants inchangés d'une langue à l'autre (cartes et automatisations)
    ids_fr = [uid(c) for c in fr]
    assert ids_fr == [uid(c) for c in en]
    # Mais le NOM affiché suit entity_language : aucun nom français identique au nom anglais
    same = [uid(c) for c, e in zip(fr, en, strict=True) if c["name"] == e["name"]]
    assert same == [], f"noms non localisés : {same}"


async def test_hp_plus_hc_egale_le_cout_total_sans_donnee_detaillee() -> None:
    """Sans résumé HC/HP, le total existe : les capteurs HP et HC ne doivent pas annoncer 0 EUR"""
    exp = exporter("fr")
    client = fake_client()
    published: dict[str, Any] = {}

    async def capture(_client: Any, **kwargs: Any) -> None:
        published[kwargs["unique_id"]] = kwargs["state"]

    with (
        patch.object(exp, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("HC_HP"), [], 6))),
        patch.object(exp, "_get_pdl_prices", AsyncMock(return_value={"hp": 0.25, "hc": 0.15})),
        patch.object(exp, "_get_hp_hc_summary", AsyncMock(return_value=None)),
        patch.object(exp, "_publish_sensor_old_format", AsyncMock(side_effect=capture)),
    ):
        await exp._export_cost_sensors(client, fake_stats(10000), MagicMock(), PDL)

    total = published[f"myelectricaldata_linky_{PDL}_cost"]
    hp = published.get(f"myelectricaldata_linky_{PDL}_cost_hp")
    hc = published.get(f"myelectricaldata_linky_{PDL}_cost_hc")
    assert total > 0
    # Soit les capteurs par tarif sont absents (inconnu), soit leur somme vaut le total : jamais 0 + 0
    assert (hp is None and hc is None) or round((hp or 0) + (hc or 0), 2) == total


async def run_tempo_cost(hours: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    exp = exporter("fr")
    published: dict[str, Any] = {}

    async def capture(_client: Any, **kwargs: Any) -> None:
        published[kwargs["unique_id"]] = kwargs["state"]

    prices = {f"{c}_{p}": 0.2 for c in ("blue", "white", "red") for p in ("hc", "hp")}
    prices["red_hp"] = 0.7
    with (
        patch.object(exp, "_get_pdl_contract_info", AsyncMock(return_value=(TariffProfile("TEMPO"), [], 6))),
        patch.object(exp, "_get_pdl_prices", AsyncMock(return_value=prices)),
        patch.object(exp, "_get_consumption_statistics_by_tariff", AsyncMock(return_value=hours)),
        patch.object(exp, "_publish_sensor_old_format", AsyncMock(side_effect=capture)),
    ):
        await exp._export_cost_sensors(fake_client(), fake_stats(10000), MagicMock(), PDL)
    return published


def tempo_day_hours(day: date) -> dict[str, list[dict[str, Any]]]:
    """Hier jour rouge : 0h-6h en blanc HC (couleur de la veille), 6h-22h rouge HP, 22h-24h rouge HC"""
    hours: dict[str, list[dict[str, Any]]] = {"white_hc": [], "red_hp": [], "red_hc": []}
    for hour in range(24):
        tag = "white_hc" if hour < 6 else "red_hp" if hour < 22 else "red_hc"
        hours[tag].append({"start": f"{day.isoformat()}T{hour:02d}:00:00+01:00", "state": 0.5, "sum": 0.0})
    # Heure de l'avant-veille, hors de la journée chiffrée
    hours["white_hc"].insert(0, {"start": f"{(day - timedelta(days=1)).isoformat()}T23:00:00+01:00", "state": 9.0, "sum": 0.0})
    return hours


async def test_tempo_ne_publie_pas_de_cout_par_couleur_fige_a_zero() -> None:
    """Un capteur monétaire figé à 0.0 alors que la consommation d'hier est > 0 est faux : Tempo ne
    publie que le coût global, calculé heure par heure avec la couleur du jour Tempo"""
    yesterday = date.today() - timedelta(days=1)
    published = await run_tempo_cost(tempo_day_hours(yesterday))

    # 6 h blanc HC + 16 h rouge HP + 2 h rouge HC : 6x0.5x0.2 + 16x0.5x0.7 + 2x0.5x0.2
    assert published[f"myelectricaldata_linky_{PDL}_cost"] == round(0.6 + 5.6 + 0.2, 2)
    assert set(published) == {f"myelectricaldata_linky_{PDL}_cost"}


async def test_tempo_sans_detail_horaire_ne_publie_pas_de_cout() -> None:
    """Données journalières seules ou couleur d'hier pas encore publiée : pas de coût moyen inventé"""
    yesterday = date.today() - timedelta(days=1)
    daily_only = {"blue_hc": [{"start": f"{yesterday.isoformat()}T00:00:00+01:00", "state": 10.0, "sum": 10.0}]}
    assert await run_tempo_cost(daily_only) == {}
    assert await run_tempo_cost({}) == {}


def test_serie_cout_total_reprend_les_cumuls_de_ha_et_suit_le_changement_d_heure() -> None:
    """Import différentiel : la série globale prolonge les cumuls déjà dans HA ; au passage à l'heure
    d'hiver, 02:00+02:00 précède 02:00+01:00 (tri sur la date, pas sur la chaîne)"""
    cost_by_tariff = {
        "hc": [
            {"start": "2026-10-25T02:00:00+01:00", "state": 0.2, "sum": 10.4},
            {"start": "2026-10-25T02:00:00+02:00", "state": 0.2, "sum": 10.2},
        ],
        "hp": [{"start": "2026-10-25T03:00:00+01:00", "state": 1.0, "sum": 21.0}],
    }
    series = HomeAssistantExporter._total_cost_series(cost_by_tariff, {"hc": 10.0, "hp": 20.0})

    assert [row["start"] for row in series] == [
        "2026-10-25T02:00:00+02:00",
        "2026-10-25T02:00:00+01:00",
        "2026-10-25T03:00:00+01:00",
    ]
    assert [row["sum"] for row in series] == [30.2, 30.4, 31.4]

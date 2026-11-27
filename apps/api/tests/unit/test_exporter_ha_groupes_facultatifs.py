"""Issue #209 : groupes de capteurs facultatifs de l'export Home Assistant

Les options export_rte_tempo, export_edf_tempo et export_zen_flex (true par défaut) permettent de ne pas
créer les capteurs Tempo et Zen Flex. Un groupe désactivé est retiré de Home Assistant : configuration
de découverte vide (retenue) pour chacun de ses capteurs, topics d'état et d'attributs vidés.
"""

from datetime import date, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from src.routers.export import HomeAssistantConfig
from src.services.exporters import home_assistant
from src.services.exporters.home_assistant import OPTIONAL_SENSOR_GROUPS, HomeAssistantExporter

NOW = datetime(2026, 11, 5, 12, 0)
TODAY = NOW.date()


class FrozenDate(date):
    @classmethod
    def today(cls) -> date:
        return TODAY


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None) -> datetime:  # type: ignore[override]
        return NOW


@pytest.fixture(autouse=True)
def frozen_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(home_assistant, "date", FrozenDate)
    monkeypatch.setattr(home_assistant, "datetime", FrozenDatetime)


class Recorder:
    """Client MQTT factice : garde chaque publication (topic, payload, retain)"""

    def __init__(self) -> None:
        self.published: list[tuple[str, Any, bool]] = []

    async def publish(self, topic: str, payload: Any = None, retain: bool = False, **kwargs: Any) -> None:
        self.published.append((topic, payload, retain))

    def topics(self) -> list[str]:
        return [topic for topic, _, _ in self.published]


class Result:
    def scalar(self) -> int:
        return 0

    def scalar_one_or_none(self) -> None:
        return None


def make_exporter(
    config: dict[str, Any] | None = None, discovery_prefix: str = "homeassistant"
) -> HomeAssistantExporter:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = config or {}
    exporter.prefix = "myelectricaldata"
    exporter.discovery_prefix = discovery_prefix
    exporter.entity_language = "fr"
    return exporter


def fake_db() -> SimpleNamespace:
    return SimpleNamespace(execute=AsyncMock(return_value=Result()))


def published_entities(client: Recorder) -> set[str]:
    """Topics d'entité (ex. myelectricaldata_rte/tempo_today) dont une configuration non vide a été publiée"""
    found = set()
    for topic, payload, _ in client.published:
        if topic.endswith("/config") and payload:
            found.add(topic.removeprefix("homeassistant/sensor/").removesuffix("/config"))
    return found


def removed_entities(client: Recorder) -> set[str]:
    """Topics d'entité dont la configuration a été vidée (message vide retenu)"""
    found = set()
    for topic, payload, retain in client.published:
        if topic.endswith("/config") and payload == b"" and retain:
            found.add(topic.split("/sensor/", 1)[1].removesuffix("/config"))
    return found


def expected(option: str) -> set[str]:
    result = set()
    for path in OPTIONAL_SENSOR_GROUPS[option]:
        device, key = path.split("/", 1)
        result.add(f"myelectricaldata_{device}/{key}")
    return result


@pytest.fixture
def tempo_prices(monkeypatch: pytest.MonkeyPatch) -> None:
    prices = {key: 0.1 for key in ("blue_hp", "blue_hc", "white_hp", "white_hc", "red_hp", "red_hc")}
    monkeypatch.setattr(HomeAssistantExporter, "_get_tempo_prices", AsyncMock(return_value=(prices, {})))


# =============================================================================
# Tempo
# =============================================================================


async def test_par_defaut_tous_les_capteurs_tempo_sont_publies(tempo_prices: None) -> None:
    client = Recorder()
    count = await make_exporter()._export_tempo_groups(client, fake_db(), [])

    assert count == 12
    assert published_entities(client) == expected("export_rte_tempo") | expected("export_edf_tempo")
    assert removed_entities(client) == set()


async def test_rte_tempo_desactive_retire_ses_entites(tempo_prices: None) -> None:
    client = Recorder()
    count = await make_exporter({"export_rte_tempo": False})._export_tempo_groups(client, fake_db(), [])

    assert count == 10
    assert published_entities(client) == expected("export_edf_tempo")
    assert removed_entities(client) == expected("export_rte_tempo")


async def test_edf_tempo_desactive_retire_ses_entites(tempo_prices: None) -> None:
    client = Recorder()
    count = await make_exporter({"export_edf_tempo": False})._export_tempo_groups(client, fake_db(), [])

    assert count == 2
    assert published_entities(client) == expected("export_rte_tempo")
    assert removed_entities(client) == expected("export_edf_tempo")


async def test_tempo_entierement_desactive_ne_lit_pas_la_base() -> None:
    client = Recorder()
    db = fake_db()
    exporter = make_exporter({"export_rte_tempo": False, "export_edf_tempo": False})

    count = await exporter._export_tempo_groups(client, db, [])

    assert count == 0
    db.execute.assert_not_awaited()
    assert published_entities(client) == set()
    assert removed_entities(client) == expected("export_rte_tempo") | expected("export_edf_tempo")


async def test_retrait_vide_aussi_etat_et_attributs() -> None:
    client = Recorder()
    await make_exporter()._remove_sensors(client, "export_rte_tempo")

    for entity in expected("export_rte_tempo"):
        for kind in ("config", "state", "attributes"):
            assert (f"homeassistant/sensor/{entity}/{kind}", b"", True) in client.published
    assert len(client.published) == 6


async def test_retrait_avec_prefixe_de_discovery_personnalise() -> None:
    client = Recorder()
    await make_exporter(discovery_prefix="ha")._remove_sensors(client, "export_zen_flex")

    for entity in expected("export_zen_flex"):
        assert (f"ha/sensor/{entity}/config", b"", True) in client.published
        # Copie publiée sous homeassistant/ par les anciennes versions : vidée aussi
        assert (f"homeassistant/sensor/{entity}/config", b"", True) in client.published


# =============================================================================
# Zen Flex
# =============================================================================


async def test_zen_flex_par_defaut_est_publie(monkeypatch: pytest.MonkeyPatch) -> None:
    export = AsyncMock(return_value=2)
    monkeypatch.setattr(HomeAssistantExporter, "_export_zen_flex", export)
    client = Recorder()

    assert await make_exporter()._export_zen_flex_group(client, fake_db()) == 2
    export.assert_awaited_once()
    assert client.published == []


async def test_zen_flex_desactive_retire_ses_entites(monkeypatch: pytest.MonkeyPatch) -> None:
    export = AsyncMock(return_value=2)
    monkeypatch.setattr(HomeAssistantExporter, "_export_zen_flex", export)
    client = Recorder()

    assert await make_exporter({"export_zen_flex": False})._export_zen_flex_group(client, fake_db()) == 0
    export.assert_not_awaited()
    assert removed_entities(client) == expected("export_zen_flex")


# =============================================================================
# Cohérence avec les topics réellement publiés et validation de la config
# =============================================================================


async def test_les_groupes_couvrent_exactement_les_topics_publies(
    tempo_prices: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Un capteur ajouté plus tard à Tempo ou Zen Flex doit aussi être déclaré dans OPTIONAL_SENSOR_GROUPS"""
    client = Recorder()
    exporter = make_exporter()
    await exporter._export_tempo(client, fake_db(), [])
    await exporter._export_zen_flex(client, fake_db())

    declared = set().union(*(expected(option) for option in OPTIONAL_SENSOR_GROUPS))
    assert published_entities(client) == declared


def test_options_activees_par_defaut_et_validees() -> None:
    config = HomeAssistantConfig()
    assert config.export_rte_tempo is True
    assert config.export_edf_tempo is True
    assert config.export_zen_flex is True

    config = HomeAssistantConfig(export_rte_tempo=False, export_edf_tempo=False, export_zen_flex=False)
    assert (config.export_rte_tempo, config.export_edf_tempo, config.export_zen_flex) == (False, False, False)

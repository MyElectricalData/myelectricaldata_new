"""Discovery MQTT Home Assistant : entity_id suggéré et préfixe personnalisé (MED-21)"""

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

from src.services.exporters.home_assistant import HomeAssistantExporter

UNIQUE_ID = "myelectricaldata_linky_123_consumption"
TOPIC = "myelectricaldata_consumption/123"
EMPTY = ("", b"", None)  # message vide = suppression d'un message retenu


def make_exporter(discovery_prefix: str = "homeassistant") -> HomeAssistantExporter:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {}
    exporter.prefix = "myelectricaldata"
    exporter.discovery_prefix = discovery_prefix
    return exporter


async def publish(exporter: HomeAssistantExporter) -> list[tuple[str, Any, bool]]:
    """Publie un capteur et rend les messages envoyés : (topic, payload, retain)"""
    client = MagicMock()
    client.publish = AsyncMock()
    await exporter._publish_sensor_old_format(
        client, topic=TOPIC, name="Consommation", unique_id=UNIQUE_ID, device={"name": "Linky 123"}, state=4.2
    )
    return [(c.args[0], c.kwargs.get("payload"), c.kwargs.get("retain", False)) for c in client.publish.await_args_list]


def config_payloads(messages: list[tuple[str, Any, bool]], topic: str) -> list[Any]:
    return [payload for t, payload, _ in messages if t == topic]


# =============================================================================
# entity_id suggéré (étape 1)
# =============================================================================


async def test_discovery_suggests_entity_id_from_unique_id() -> None:
    """HA dérive sinon l'entity_id du nom de l'appareil (sensor.linky_123_…), pas de la doc"""
    messages = await publish(make_exporter())

    [payload] = config_payloads(messages, f"homeassistant/sensor/{TOPIC}/config")
    config = json.loads(payload)
    # HA >= 2025.10 (object_id déprécié puis retiré en 2026.4)
    assert config["default_entity_id"] == f"sensor.{UNIQUE_ID}"
    # HA < 2025.10 ; ignoré sans avertissement par les versions récentes
    assert config["object_id"] == UNIQUE_ID
    assert config["uniq_id"] == UNIQUE_ID


# =============================================================================
# discovery_prefix personnalisé (étape 6)
# =============================================================================


async def test_custom_prefix_publishes_config_under_its_prefix_only() -> None:
    messages = await publish(make_exporter("ha_discovery"))

    [payload] = config_payloads(messages, f"ha_discovery/sensor/{TOPIC}/config")
    assert json.loads(payload)["uniq_id"] == UNIQUE_ID
    # Plus aucune config sous homeassistant/ : seulement la purge (message vide retenu) de l'ancienne copie
    legacy = [(t, payload, retain) for t, payload, retain in messages if t.startswith("homeassistant/")]
    assert len(legacy) == 1
    topic, payload, retain = legacy[0]
    assert topic == f"homeassistant/sensor/{TOPIC}/config"
    assert payload in EMPTY and retain is True
    assert all(t.startswith("ha_discovery/") for t, payload, _ in messages if payload not in EMPTY)


async def test_default_prefix_never_purges_its_own_config() -> None:
    """Préfixe par défaut : la purge viderait la config qu'on vient de publier"""
    messages = await publish(make_exporter())

    assert all(payload not in EMPTY for _, payload, _ in messages)
    assert len(config_payloads(messages, f"homeassistant/sensor/{TOPIC}/config")) == 1

"""Capteurs Zen Flex aujourd'hui / demain : Home Assistant (Discovery) et MQTT générique (MED-27)

Même logique que Tempo : un jour absent du calendrier est « inconnu », jamais « Éco » par défaut.
"""

import json
from collections.abc import AsyncIterator
from datetime import date, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.base import Base
from src.models.zen_flex_day import ZenFlexDay, ZenFlexDayType
from src.services.exporters import home_assistant, mqtt
from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.mqtt import MQTTExporter

NOW = datetime(2025, 12, 15, 14, 30)
TODAY = NOW.date()
TOMORROW = TODAY + timedelta(days=1)


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
    for module in (home_assistant, mqtt):
        monkeypatch.setattr(module, "date", FrozenDate)
        monkeypatch.setattr(module, "datetime", FrozenDatetime)


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[ZenFlexDay.__table__]))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


async def add_days(db: AsyncSession, days: dict[date, ZenFlexDayType]) -> None:
    for day, day_type in days.items():
        db.add(ZenFlexDay(id=day.isoformat(), date=day, day_type=day_type, raw_value="test"))
    await db.commit()


# =============================================================================
# Home Assistant (MQTT Discovery)
# =============================================================================


def make_ha_exporter() -> HomeAssistantExporter:
    exporter = HomeAssistantExporter.__new__(HomeAssistantExporter)
    exporter.config = {}
    exporter.prefix = "myelectricaldata"
    exporter.discovery_prefix = "homeassistant"
    return exporter


async def ha_messages(db: AsyncSession) -> dict[str, Any]:
    """Exporte Zen Flex et rend {topic: payload} des messages publiés"""
    client = MagicMock()
    client.publish = AsyncMock()
    count = await make_ha_exporter()._export_zen_flex(client, db)
    assert count == 2
    return {c.args[0]: c.kwargs.get("payload") for c in client.publish.await_args_list}


async def test_ha_publishes_zen_flex_today_and_tomorrow(db: AsyncSession) -> None:
    await add_days(db, {TODAY: ZenFlexDayType.ECO, TOMORROW: ZenFlexDayType.SOBRIETE})
    messages = await ha_messages(db)

    base = "homeassistant/sensor/myelectricaldata_edf"
    assert messages[f"{base}/zen_flex_today/state"] == "ECO"
    assert messages[f"{base}/zen_flex_tomorrow/state"] == "SOBRIETE"

    config = json.loads(messages[f"{base}/zen_flex_tomorrow/config"])
    assert config["uniq_id"] == "myelectricaldata_zen_flex_tomorrow"
    assert config["default_entity_id"] == "sensor.myelectricaldata_zen_flex_tomorrow"
    assert config["device"]["name"] == "EDF Zen Flex"

    attributes = json.loads(messages[f"{base}/zen_flex_tomorrow/attributes"])
    assert attributes["date"] == TOMORROW.isoformat()
    assert attributes["day_type_fr"] == "Sobriété"


async def test_ha_unknown_day_is_not_eco(db: AsyncSession) -> None:
    await add_days(db, {TODAY: ZenFlexDayType.BONUS})
    messages = await ha_messages(db)
    base = "homeassistant/sensor/myelectricaldata_edf"
    assert messages[f"{base}/zen_flex_today/state"] == "BONUS"
    assert messages[f"{base}/zen_flex_tomorrow/state"] == "unknown"


def test_ha_read_metrics_categorizes_zen_flex() -> None:
    exporter = make_ha_exporter()
    base = "homeassistant/sensor/myelectricaldata_edf"
    assert exporter._categorize_ha_topic(f"{base}/zen_flex_today/state") == "Zen Flex Aujourd'hui"
    assert exporter._categorize_ha_topic(f"{base}/zen_flex_tomorrow/state") == "Zen Flex Demain"


# =============================================================================
# MQTT générique
# =============================================================================


def make_mqtt_exporter() -> MQTTExporter:
    exporter = MQTTExporter.__new__(MQTTExporter)
    exporter.config = {}
    return exporter


async def test_mqtt_zen_flex_data(db: AsyncSession) -> None:
    await add_days(db, {TODAY: ZenFlexDayType.SOBRIETE, TOMORROW: ZenFlexDayType.ECO})
    data = await make_mqtt_exporter()._get_zen_flex_data(db)
    assert data == {
        "today": {"day_type": "SOBRIETE", "date": TODAY.isoformat()},
        "tomorrow": {"day_type": "ECO", "date": TOMORROW.isoformat()},
    }
    json.dumps(data)


async def test_mqtt_zen_flex_unknown_tomorrow(db: AsyncSession) -> None:
    await add_days(db, {TODAY: ZenFlexDayType.ECO})
    data = await make_mqtt_exporter()._get_zen_flex_data(db)
    assert data is not None
    assert data["tomorrow"] == {"day_type": "UNKNOWN", "date": TOMORROW.isoformat()}


async def test_mqtt_zen_flex_without_calendar(db: AsyncSession) -> None:
    """Toujours publié : un message retenu de la veille ne doit pas survivre à une synchro en panne"""
    data = await make_mqtt_exporter()._get_zen_flex_data(db)
    assert data == {
        "today": {"day_type": "UNKNOWN", "date": TODAY.isoformat()},
        "tomorrow": {"day_type": "UNKNOWN", "date": TOMORROW.isoformat()},
    }


async def test_ha_zen_flex_follows_entity_prefix(db: AsyncSession) -> None:
    """Préfixe d'entités paramétrable (MED-17) : topics, unique_id et catégorie le suivent"""
    await add_days(db, {TODAY: ZenFlexDayType.SOBRIETE})
    exporter = make_ha_exporter()
    exporter.prefix = "maison"
    client = MagicMock()
    client.publish = AsyncMock()
    await exporter._export_zen_flex(client, db)
    messages = {c.args[0]: c.kwargs.get("payload") for c in client.publish.await_args_list}

    base = "homeassistant/sensor/maison_edf"
    assert messages[f"{base}/zen_flex_today/state"] == "SOBRIETE"
    assert json.loads(messages[f"{base}/zen_flex_today/config"])["uniq_id"] == "maison_zen_flex_today"
    assert not any("myelectricaldata" in topic for topic in messages)
    assert exporter._categorize_ha_topic(f"{base}/zen_flex_tomorrow/state") == "Zen Flex Demain"

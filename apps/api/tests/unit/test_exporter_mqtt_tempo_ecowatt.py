"""Exporteur MQTT générique : Tempo et EcoWatt (MED-21)

Les imports de mqtt.py visaient des modèles inexistants (`models.tempo`, `EcoWattSignal`) :
chaque export levait une erreur. Base SQLite en mémoire pour exécuter les vraies requêtes.
"""

import json
from collections.abc import AsyncIterator
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.base import Base
from src.models.ecowatt import EcoWatt
from src.models.tempo_day import TempoColor, TempoDay
from src.services.exporters import mqtt
from src.services.exporters.mqtt import MQTTExporter

# Instant figé : l'exporteur lit date.today() / datetime.now(), le test ne dépend pas de l'heure
NOW = datetime(2026, 10, 5, 14, 30)
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
    monkeypatch.setattr(mqtt, "date", FrozenDate)
    monkeypatch.setattr(mqtt, "datetime", FrozenDatetime)


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[TempoDay.__table__, EcoWatt.__table__]))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


def make_exporter() -> MQTTExporter:
    exporter = MQTTExporter.__new__(MQTTExporter)
    exporter.config = {}
    return exporter


def tempo_day(day: date, color: TempoColor) -> TempoDay:
    return TempoDay(id=day.isoformat(), date=datetime.combine(day, datetime.min.time()), color=color)


async def test_tempo_today_tomorrow_and_remaining(db: AsyncSession) -> None:
    db.add_all([
        tempo_day(date(2026, 9, 1), TempoColor.BLUE),  # 1er jour de la saison
        tempo_day(date(2026, 8, 31), TempoColor.RED),  # saison précédente : non décompté
        tempo_day(TODAY, TempoColor.RED),
        tempo_day(TODAY + timedelta(days=1), TempoColor.WHITE),
    ])
    await db.commit()

    data = await make_exporter()._get_tempo_data(db)

    assert data is not None
    assert data["today"] == {"color": "RED", "date": "2026-10-05"}
    assert data["tomorrow"] == {"color": "WHITE", "date": "2026-10-06"}
    # Jours consommés jusqu'à aujourd'hui inclus : demain (blanc) n'est pas encore décompté
    assert data["remaining"] == {"blue": 299, "white": 43, "red": 21}
    assert data["season"] == "2026/2027"
    json.dumps(data)  # publié tel quel sur le broker


async def test_tempo_nothing_without_days(db: AsyncSession) -> None:
    assert await make_exporter()._get_tempo_data(db) is None


async def test_ecowatt_current_and_next_hour(db: AsyncSession) -> None:
    values = [1] * 24
    values[14] = 3  # heure courante (14 h 30)
    values[15] = 2
    db.add(EcoWatt(
        generation_datetime=NOW,
        # Minuit local : à confirmer sur une base réelle (rte.py stocke periode en UTC naïf, cf. MED-21)
        periode=datetime.combine(TODAY, datetime.min.time()),
        hdebut=0,
        hfin=23,
        pas=60,
        dvalue=2,
        message="Consommation tendue",
        values=values,
    ))
    # Le lendemain ne doit pas être pris pour aujourd'hui
    db.add(EcoWatt(
        generation_datetime=NOW,
        periode=datetime.combine(TODAY + timedelta(days=1), datetime.min.time()),
        hdebut=0,
        hfin=23,
        pas=60,
        dvalue=1,
        message="Demain",
        values=[1] * 24,
    ))
    await db.commit()

    data = await make_exporter()._get_ecowatt_data(db)

    assert data is not None
    assert data["date"] == "2026-10-05"
    assert data["level"] == 3
    assert data["level_label"] == "Rouge"
    assert data["next_hour_level"] == 2
    assert data["message"] == "Consommation tendue"
    json.dumps(data)


async def test_ecowatt_nothing_without_signal(db: AsyncSession) -> None:
    assert await make_exporter()._get_ecowatt_data(db) is None

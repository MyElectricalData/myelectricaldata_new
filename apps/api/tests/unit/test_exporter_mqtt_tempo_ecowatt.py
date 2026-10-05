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
from src.services.exporters.mqtt import MQTTExporter


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
    today = date.today()
    season_start = date(today.year if today.month >= 9 else today.year - 1, 9, 1)
    db.add_all([tempo_day(today, TempoColor.RED), tempo_day(today + timedelta(days=1), TempoColor.WHITE)])
    used_blue = 0
    if season_start < today:  # un jour bleu plus tôt dans la saison (sauf le 1er septembre)
        db.add(tempo_day(season_start, TempoColor.BLUE))
        used_blue = 1
    await db.commit()

    data = await make_exporter()._get_tempo_data(db)

    assert data is not None
    assert data["today"] == {"color": "RED", "date": today.isoformat()}
    assert data["tomorrow"] == {"color": "WHITE", "date": (today + timedelta(days=1)).isoformat()}
    # Jours consommés jusqu'à aujourd'hui inclus : demain (blanc) n'est pas encore décompté
    assert data["remaining"] == {"blue": 300 - used_blue, "white": 43, "red": 21}
    json.dumps(data)  # publié tel quel sur le broker


async def test_tempo_nothing_without_days(db: AsyncSession) -> None:
    assert await make_exporter()._get_tempo_data(db) is None


async def test_ecowatt_current_and_next_hour(db: AsyncSession) -> None:
    today = date.today()
    values = [1] * 24
    hour = datetime.now().hour
    values[hour] = 3
    if hour < 23:
        values[hour + 1] = 2
    db.add(EcoWatt(
        generation_datetime=datetime.now(),
        periode=datetime.combine(today, datetime.min.time()),
        hdebut=0,
        hfin=23,
        pas=60,
        dvalue=2,
        message="Consommation tendue",
        values=values,
    ))
    # Le lendemain ne doit pas être pris pour aujourd'hui
    db.add(EcoWatt(
        generation_datetime=datetime.now(),
        periode=datetime.combine(today + timedelta(days=1), datetime.min.time()),
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
    assert data["date"] == today.isoformat()
    assert data["level"] == 3
    assert data["level_label"] == "Rouge"
    assert data["next_hour_level"] == (2 if hour < 23 else None)
    assert data["message"] == "Consommation tendue"
    json.dumps(data)


async def test_ecowatt_nothing_without_signal(db: AsyncSession) -> None:
    assert await make_exporter()._get_ecowatt_data(db) is None

"""Mode client : synchro du calendrier Zen Flex depuis la passerelle (MED-27)

Le client n'appelle jamais EDF : il lit `GET /zen-flex/days` de la passerelle (enveloppe
{success, data}) et range les jours dans sa table locale, comme Tempo.
"""

from collections.abc import AsyncIterator
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.base import Base
from src.models.zen_flex_day import ZenFlexDay, ZenFlexDayType
from src.services import sync
from src.services.sync import SyncService


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[ZenFlexDay.__table__]))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


def make_service(db: AsyncSession, response: dict) -> SyncService:
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    service.adapter.get_zen_flex_calendar = AsyncMock(return_value=response)
    service._update_sync_tracker = AsyncMock()  # type: ignore[method-assign]
    return service


async def stored(db: AsyncSession) -> dict[str, str]:
    rows = (await db.execute(select(ZenFlexDay))).scalars().all()
    return {row.id: row.day_type.value for row in rows}


async def test_sync_zen_flex_stores_gateway_days(db: AsyncSession) -> None:
    service = make_service(db, {"success": True, "data": [
        {"date": "2025-12-15", "day_type": "ECO"},
        {"date": "2025-12-16", "day_type": "SOBRIETE"},
        {"date": "2023-12-07", "day_type": "BONUS"},
    ]})
    result = await service.sync_zen_flex()
    assert result["created"] == 3
    assert await stored(db) == {"2025-12-15": "ECO", "2025-12-16": "SOBRIETE", "2023-12-07": "BONUS"}


async def test_sync_zen_flex_updates_and_ignores_invalid_days(db: AsyncSession) -> None:
    db.add(ZenFlexDay(id="2025-12-16", date=date(2025, 12, 16), day_type=ZenFlexDayType.ECO))
    await db.commit()
    service = make_service(db, {"success": True, "data": [
        {"date": "2025-12-16", "day_type": "SOBRIETE"},
        {"date": "2025-12-17", "day_type": "VIOLET"},
        {"day_type": "ECO"},
    ]})
    result = await service.sync_zen_flex()
    assert result["updated"] == 1
    assert await stored(db) == {"2025-12-16": "SOBRIETE"}


async def requested_start(db: AsyncSession, monkeypatch: pytest.MonkeyPatch, known_days: int) -> str | None:
    """Début demandé à la passerelle quand les `known_days` premiers jours de l'offre sont connus"""
    offer_start, today = date(2025, 12, 1), date(2025, 12, 15)
    monkeypatch.setattr(sync, "OFFER_START", offer_start)
    monkeypatch.setattr(sync, "paris_today", lambda: today)
    for n in range(known_days):
        day = offer_start + timedelta(days=n)
        db.add(ZenFlexDay(id=day.isoformat(), date=day, day_type=ZenFlexDayType.ECO))
    await db.commit()
    service = make_service(db, {"success": True, "data": []})
    await service.sync_zen_flex()
    return service.adapter.get_zen_flex_calendar.await_args.kwargs.get("start")


async def test_sync_zen_flex_is_incremental_once_history_is_complete(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Historique complet : seuls les derniers jours sont redemandés, pas tout le calendrier depuis 2023"""
    start = await requested_start(db, monkeypatch, known_days=15)
    assert start is not None and "2025-12-01" < start <= "2025-12-15"


async def test_sync_zen_flex_refetches_everything_while_history_has_gaps(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Passerelle encore en rattrapage lors d'une synchro précédente : les trous se comblent"""
    assert await requested_start(db, monkeypatch, known_days=10) is None


async def test_sync_zen_flex_reports_gateway_error(db: AsyncSession) -> None:
    service = make_service(db, {"success": False, "error": {"code": "BAD_GATEWAY"}})
    result = await service.sync_zen_flex()
    assert result["errors"]
    assert await stored(db) == {}

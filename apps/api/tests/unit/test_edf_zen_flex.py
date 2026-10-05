"""Calendrier EDF Zen Flex : client getOPMStatut et cache des jours (MED-27)

API EDF non documentée : `GET particulier.edf.fr/services/rest/opm/getOPMStatut?dateRelevant=...`
rend `{couleurJourJ, couleurJourJ1}`. Le pare-feu EDF répond 403 en HTML à un User-Agent de
navigateur : JSON exigé, User-Agent neutre. Transport httpx simulé, base SQLite en mémoire.
"""

from collections.abc import AsyncIterator, Callable
from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.base import Base
from src.models.zen_flex_day import ZenFlexDay, ZenFlexDayType
from src.services import edf_zen_flex
from src.services.edf_zen_flex import EDFZenFlexError, EDFZenFlexService, parse_opm_value

TODAY = date(2025, 12, 15)


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=[ZenFlexDay.__table__]))
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


class FakeEDF:
    """Faux getOPMStatut : calendrier {date: valeur EDF}, RAS par défaut, NON_DETERMINE au-delà de TODAY + 1"""

    def __init__(self, calendar: dict[date, str] | None = None, fail: Callable[[date], bool] | None = None) -> None:
        self.calendar = calendar or {}
        self.fail = fail or (lambda _day: False)
        self.requests: list[httpx.Request] = []

    def value(self, day: date) -> str:
        if day > TODAY + timedelta(days=1):
            return "NON_DETERMINE"
        return self.calendar.get(day, "RAS")

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        day = date.fromisoformat(request.url.params["dateRelevant"])
        if self.fail(day):
            return httpx.Response(403, html="<!DOCTYPE html><title>Particulier EDF - Page inaccessible</title>")
        return httpx.Response(
            200, json={"couleurJourJ": self.value(day), "couleurJourJ1": self.value(day + timedelta(days=1))}
        )

    def service(self) -> EDFZenFlexService:
        return EDFZenFlexService(transport=httpx.MockTransport(self.handler))

    @property
    def days_requested(self) -> list[date]:
        return [date.fromisoformat(r.url.params["dateRelevant"]) for r in self.requests]


async def stored(db: AsyncSession) -> dict[date, str]:
    rows = (await db.execute(select(ZenFlexDay))).scalars().all()
    return {date.fromisoformat(row.id): row.day_type.value for row in rows}


# =============================================================================
# Valeurs EDF
# =============================================================================


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("RAS", ZenFlexDayType.ECO),
        ("ZENF_PM", ZenFlexDayType.SOBRIETE),
        ("ZENF_BONIF", ZenFlexDayType.BONUS),  # valeur réelle des jours bonus (07/12/2023, 18/03/2025)
        ("ZENF_BONUS", ZenFlexDayType.BONUS),  # variante citée par jarthod/tempo-api
        ("NON_DETERMINE", None),
        ("", None),
        (None, None),
        ("ZENF_INCONNU", None),  # valeur nouvelle : pas de type deviné
    ],
)
def test_parse_opm_value(raw: Any, expected: ZenFlexDayType | None) -> None:
    assert parse_opm_value(raw) == expected


# =============================================================================
# Client HTTP
# =============================================================================


async def test_fetch_status_reads_today_and_tomorrow() -> None:
    edf = FakeEDF({TODAY + timedelta(days=1): "ZENF_PM"})
    assert await edf.service().fetch_status(TODAY) == (ZenFlexDayType.ECO, ZenFlexDayType.SOBRIETE)


async def test_fetch_status_request_passes_the_edf_firewall() -> None:
    """dateRelevant + urlPlaasmaCommerce, Accept JSON, et surtout pas de User-Agent de navigateur"""
    edf = FakeEDF()
    await edf.service().fetch_status(TODAY)
    request = edf.requests[0]
    assert request.url.host == "particulier.edf.fr"
    assert request.url.path == "/services/rest/opm/getOPMStatut"
    assert request.url.params["dateRelevant"] == "2025-12-15"
    assert request.url.params["urlPlaasmaCommerce"] == "https://api-commerce.edf.fr"
    assert request.headers["accept"] == "application/json"
    assert "mozilla" not in request.headers.get("user-agent", "").lower()


async def test_fetch_status_rejects_the_html_error_page() -> None:
    edf = FakeEDF(fail=lambda _day: True)
    with pytest.raises(EDFZenFlexError):
        await edf.service().fetch_status(TODAY)


async def test_fetch_status_rejects_html_served_with_200() -> None:
    """EDF peut servir sa page d'erreur en 200 : le Content-Type fait foi"""
    service = EDFZenFlexService(transport=httpx.MockTransport(lambda _r: httpx.Response(200, html="<html></html>")))
    with pytest.raises(EDFZenFlexError):
        await service.fetch_status(TODAY)


# =============================================================================
# Cache : aujourd'hui, demain et rattrapage de l'historique
# =============================================================================


async def test_update_stores_today_and_tomorrow(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(edf_zen_flex, "OFFER_START", TODAY)
    edf = FakeEDF({TODAY + timedelta(days=1): "ZENF_PM"})
    await edf.service().update_zen_flex_cache(db, today=TODAY)
    assert await stored(db) == {TODAY: "ECO", TODAY + timedelta(days=1): "SOBRIETE"}


async def test_update_skips_undetermined_tomorrow(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """J+1 encore NON_DETERMINE (avant la publication EDF) : rien d'écrit, surtout pas « Éco »"""
    monkeypatch.setattr(edf_zen_flex, "OFFER_START", TODAY + timedelta(days=1))
    edf = FakeEDF()
    await edf.service().update_zen_flex_cache(db, today=TODAY + timedelta(days=1))
    assert await stored(db) == {TODAY + timedelta(days=1): "ECO"}


async def test_update_overwrites_a_changed_day(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(edf_zen_flex, "OFFER_START", TODAY)
    await FakeEDF().service().update_zen_flex_cache(db, today=TODAY)
    await FakeEDF({TODAY + timedelta(days=1): "ZENF_PM"}).service().update_zen_flex_cache(db, today=TODAY)
    assert (await stored(db))[TODAY + timedelta(days=1)] == "SOBRIETE"


async def test_backfill_is_bounded_and_recent_first(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """Historique depuis le lancement de l'offre, par lots : le WAF EDF ne doit pas voir de rafale"""
    monkeypatch.setattr(edf_zen_flex, "OFFER_START", TODAY - timedelta(days=10))
    edf = FakeEDF({TODAY - timedelta(days=1): "ZENF_PM", TODAY - timedelta(days=9): "ZENF_BONIF"})

    await edf.service().update_zen_flex_cache(db, today=TODAY, backfill_limit=2)
    assert len(edf.requests) <= 3  # aujourd'hui + 2 appels de rattrapage au plus
    assert (await stored(db))[TODAY - timedelta(days=1)] == "SOBRIETE"  # la veille d'abord

    for _ in range(10):
        await edf.service().update_zen_flex_cache(db, today=TODAY, backfill_limit=2)
    days = await stored(db)
    assert set(days) == {TODAY + timedelta(days=n) for n in range(-10, 2)}
    assert days[TODAY - timedelta(days=9)] == "BONUS"


async def test_backfill_does_not_refetch_known_days(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(edf_zen_flex, "OFFER_START", TODAY - timedelta(days=3))
    for _ in range(5):
        await FakeEDF().service().update_zen_flex_cache(db, today=TODAY, backfill_limit=10)
    edf = FakeEDF()
    await edf.service().update_zen_flex_cache(db, today=TODAY, backfill_limit=10)
    assert edf.days_requested == [TODAY]


async def test_backfill_stops_on_edf_error(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """Un refus EDF (403 du pare-feu) arrête le lot : pas d'insistance, erreur remontée sans exception"""
    monkeypatch.setattr(edf_zen_flex, "OFFER_START", TODAY - timedelta(days=10))
    edf = FakeEDF(fail=lambda day: day < TODAY)
    result = await edf.service().update_zen_flex_cache(db, today=TODAY, backfill_limit=5)
    assert result["errors"]
    assert len(edf.requests) == 2  # aujourd'hui (OK) puis le premier rattrapage refusé
    assert set(await stored(db)) == {TODAY, TODAY + timedelta(days=1)}

"""Export Home Assistant : HC et HP de la carte Linky selon le pas de la courbe (#219, MED-126)

`_export_linky_card_stats` convertit chaque point de la courbe de charge (W moyens sur le créneau) en Wh.
Le pas du créneau doit être celui du relevé : 30 min (W / 2), 15 min (W / 4) ou 10 min (W / 6), sinon
HC + HP ne retombent pas sur la consommation du jour (24,54 kWh annoncés, 49,08 kWh en HC + HP, #219).

Les relevés viennent d'une vraie base SQLite lue par le vrai `StatisticsService` : le test ne dépend pas
de la forme des tuples rendus par `get_detailed_range`. Plages creuses : 22h-6h, soit 8 h de HC par jour.
"""

from collections.abc import AsyncIterator
from datetime import date, datetime
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.client_mode import ConsumptionData, DataGranularity, MaxPowerData
from src.services.exporters import home_assistant
from src.services.exporters.home_assistant import HomeAssistantExporter
from src.services.exporters.tariff import TariffProfile
from src.services.statistics import StatisticsService

PDL = "12345678901234"
NOW = datetime(2026, 10, 28, 8, 0)
TODAY = NOW.date()
YESTERDAY = date(2026, 10, 27)
NIGHT = [(22 * 60, 6 * 60)]  # 22h-6h : 8 h de HC par jour
PT30M, PT15M, PT10M = {"p": "PT30M"}, {"p": "PT15M"}, {"p": "PT10M"}


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


@pytest.fixture
async def session(tmp_path: Path) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'courbe.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(ConsumptionData.__table__.create)
        await conn.run_sync(MaxPowerData.__table__.create)
    async with async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as db:
        yield db
    await engine.dispose()


def slot(start: str, watts: int, raw_data: dict) -> ConsumptionData:
    return ConsumptionData(
        usage_point_id=PDL,
        date=YESTERDAY,
        granularity=DataGranularity.DETAILED,
        interval_start=start,
        value=watts,
        raw_data=raw_data,
    )


def curve(first_minute: int, last_minute: int, step: int, watts: int, raw_data: dict) -> list[ConsumptionData]:
    """Créneaux de `step` minutes de first_minute (inclus) à last_minute (exclu), tous à `watts` W"""
    return [
        slot(f"{m // 60:02d}:{m % 60:02d}", watts, raw_data) for m in range(first_minute, last_minute, step)
    ]


async def export_hc_hp(session: AsyncSession, records: list[ConsumptionData], total_wh: int) -> tuple[float, float]:
    """(HC, HP) kWh d'hier publiés dans `dailyweek_HC` et `dailyweek_HP` de la carte Linky"""
    session.add_all(records)
    session.add(
        ConsumptionData(
            usage_point_id=PDL,
            date=YESTERDAY,
            granularity=DataGranularity.DAILY,
            interval_start=None,
            value=total_wh,
            raw_data=None,
        )
    )
    await session.commit()

    exporter = HomeAssistantExporter({"mqtt_broker": "mqtt.local"})
    exporter._get_pdl_contract_info = AsyncMock(return_value=(TariffProfile("HC_HP"), NIGHT, None))  # type: ignore[method-assign]
    published: dict[str, Any] = {}

    async def capture(client: Any, *, attributes: dict[str, Any] | None = None, **kwargs: Any) -> None:
        published.update(attributes or {})

    exporter._publish_sensor_old_format = capture  # type: ignore[method-assign]

    # Requêtes propres à l'export (offre, PDL, Tempo) : aucune ligne, la config d'export fait foi
    empty = MagicMock()
    empty.first.return_value = None
    empty.all.return_value = []
    empty.scalar_one_or_none.return_value = None
    db = MagicMock()
    db.execute = AsyncMock(return_value=empty)

    assert await exporter._export_linky_card_stats(MagicMock(), StatisticsService(session), db, PDL) == 1

    days = published["dailyweek"].split(",")
    index = days.index(f"{YESTERDAY.isoformat()}T00:00:00")
    return float(published["dailyweek_HC"].split(",")[index]), float(published["dailyweek_HP"].split(",")[index])


async def test_pas_de_30_min_inchange(session: AsyncSession) -> None:
    """Garde-fou : 1 000 W toute la journée à 30 min = 24 kWh, dont 8 kWh de HC"""
    hc, hp = await export_hc_hp(session, curve(0, 1440, 30, 1000, PT30M), 24000)

    assert (hc, hp) == (pytest.approx(8.0), pytest.approx(16.0))


async def test_pas_de_15_min_journee_non_doublee(session: AsyncSession) -> None:
    """Courbe à 15 min : 24 kWh en HC + HP, pas 48 (W / 2 au lieu de W / 4, content-card-linky-new#13)"""
    hc, hp = await export_hc_hp(session, curve(0, 1440, 15, 1000, PT15M), 24000)

    assert (hc, hp) == (pytest.approx(8.0), pytest.approx(16.0))


async def test_creneau_ecrit_deux_fois_compte_une_fois(session: AsyncSession) -> None:
    """Le créneau 08:00 relevé sous deux écritures ("08:00" puis "08:00:00") ne vaut qu'un créneau"""
    records = curve(0, 1440, 30, 1000, PT30M) + [slot("08:00:00", 1000, PT30M)]

    hc, hp = await export_hc_hp(session, records, 24000)

    assert hc + hp == pytest.approx(24.0)


async def test_pas_mixte_dans_la_journee(session: AsyncSession) -> None:
    """Jour de bascule du compteur : 30 min jusqu'à midi, puis 10 min. Chaque relevé garde SON pas (MED-58)

    1 000 W toute la journée = 24 kWh ; HC 22h-6h = 6 kWh sur le matin à 30 min + 2 kWh le soir à 10 min.
    """
    records = curve(0, 720, 30, 1000, PT30M) + curve(720, 1440, 10, 1000, PT10M)

    hc, hp = await export_hc_hp(session, records, 24000)

    assert hc + hp == pytest.approx(24.0)
    assert (hc, hp) == (pytest.approx(8.0), pytest.approx(16.0))


async def test_releve_isole_au_pas_de_15_min(session: AsyncSession) -> None:
    """Un seul relevé du jour (synchro partielle) : son pas se lit dans raw_data, il ne se devine pas

    1 000 W sur 15 min à 23h00 (HC) = 250 Wh. Faute d'un deuxième horaire, le pas déduit retombe à 30 min.
    """
    hc, hp = await export_hc_hp(session, [slot("23:00", 1000, PT15M)], 250)

    assert (hc, hp) == (pytest.approx(0.25), pytest.approx(0.0))


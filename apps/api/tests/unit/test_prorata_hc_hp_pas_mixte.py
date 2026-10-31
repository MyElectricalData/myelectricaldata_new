"""Prorata HC/HP (PR #193) sur une courbe de charge à pas mixte (MED-93)

Un compteur reconfiguré mélange les pas dans une même courbe (PT30M puis PT10M, cf. MED-24 côté
front). Le prorata d'un créneau doit se calculer sur SON pas, pas sur le plus petit pas de la période :
sur 23h32-5h32, le créneau 23h30 en PT30M compte 28/30 en HC, pas 8/10.

Plages de l'exemple : 23h32-5h32, bascules en milieu de créneau (relevées sur un contrat réel).
"""

from collections.abc import AsyncIterator
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.models.client_mode import ConsumptionData, DataGranularity
from src.services.exporters.tariff import TariffProfile
from src.services.statistics import StatisticsService
from tests.unit.test_exporter_ha_incremental import fake_db, make_exporter

PDL = "12345678901234"
MONDAY = date(2026, 9, 28)
TUESDAY = date(2026, 9, 29)
NIGHT_32 = [(23 * 60 + 32, 5 * 60 + 32)]  # 23h32-5h32
PT30M = {"p": "PT30M"}
PT10M = {"p": "PT10M"}


def detailed(day: date, start: str, value: int, raw_data: dict) -> ConsumptionData:
    return ConsumptionData(
        usage_point_id=PDL,
        date=day,
        granularity=DataGranularity.DETAILED,
        interval_start=start,
        value=value,
        raw_data=raw_data,
    )


@pytest.fixture
async def db(tmp_path: Path) -> AsyncIterator[AsyncSession]:
    """SQLite réelle : la requête de StatisticsService doit ramener elle-même ce dont le calcul a besoin"""
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'stats.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(ConsumptionData.__table__.create)
    async with async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)() as session:
        yield session
    await engine.dispose()


# =============================================================================
# StatisticsService : le pas ne doit pas être celui de toute l'année
# =============================================================================


async def test_hp_hc_year_total_prorata_sur_le_pas_de_chaque_releve(db: AsyncSession) -> None:
    """Un créneau 23h30 en PT30M dans une année qui passe ensuite en PT10M : 28/30 en HC, pas 8/10"""
    db.add_all(
        [
            detailed(MONDAY, "23:30", 1200, PT30M),
            detailed(TUESDAY, "00:00", 0, PT10M),
            detailed(TUESDAY, "00:10", 0, PT10M),
            detailed(TUESDAY, "00:20", 0, PT10M),
        ]
    )
    await db.commit()

    hp, hc = await StatisticsService(db).get_hp_hc_year_total(PDL, 2026, NIGHT_32)

    assert hc / (hp + hc) == pytest.approx(28 / 30, abs=0.01)


async def test_hp_hc_year_total_pas_homogene_inchange(db: AsyncSession) -> None:
    """Garde-fou : courbe entièrement en PT30M, le prorata de la PR reste 28/30"""
    db.add_all(
        [
            detailed(MONDAY, "23:00", 0, PT30M),
            detailed(MONDAY, "23:30", 1200, PT30M),
            detailed(TUESDAY, "00:00", 0, PT30M),
        ]
    )
    await db.commit()

    hp, hc = await StatisticsService(db).get_hp_hc_year_total(PDL, 2026, NIGHT_32)

    assert (hp, hc) == (80, 1120)


# =============================================================================
# StatisticsService : HP + HC doit retomber sur le total
# =============================================================================


def test_split_hp_hc_somme_egale_au_total_malgre_les_arrondis() -> None:
    """Trois créneaux de 1 Wh répartis moitié-moitié : arrondir HP et HC séparément donne 2 + 2 = 4 Wh"""
    half = [(22 * 60 + 15, 6 * 60 + 15)]  # 22h15 : le créneau 22h00-22h30 est HC pour moitié
    rows = [
        SimpleNamespace(date=date(2026, 9, day), interval_start="22:00", value=1, raw_data=PT30M)
        for day in (28, 29, 30)
    ]

    hp, hc = StatisticsService._split_hp_hc(rows, half)

    assert hp + hc == 3


# =============================================================================
# Export Home Assistant : le pas de chaque relevé est déjà lu (garde-fou)
# =============================================================================


async def test_ha_agregation_horaire_pas_mixte_prorata_par_releve() -> None:
    """HA lit raw_data de chaque relevé : 23h30 en PT30M (28/30 HC) et 23h50 en PT10M (tout HC)"""
    exporter = make_exporter()
    exporter._get_pdl_contract_info = AsyncMock(return_value=(TariffProfile("HC_HP"), NIGHT_32, None))  # type: ignore[method-assign]
    records = [
        SimpleNamespace(date=MONDAY, interval_start="23:30", value=2400, raw_data=PT30M),  # 1,2 kWh
        SimpleNamespace(date=MONDAY, interval_start="23:50", value=6000, raw_data=PT10M),  # 1,0 kWh
    ]

    stats = await exporter._get_consumption_statistics_by_tariff(fake_db(records), PDL)

    assert [s["state"] for s in stats["hc"]] == [pytest.approx(1.12 + 1.0)]
    assert [s["state"] for s in stats["hp"]] == [pytest.approx(0.08)]

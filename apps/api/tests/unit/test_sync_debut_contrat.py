"""Mode client : la synchro ne remonte pas avant la mise en service du contrat (issue #188)

Enedis n'a aucune donnée avant la date de mise en service : sans borne, les semaines antérieures
restaient « manquantes » et étaient redemandées à chaque synchro (NO_DATA, quota consommé pour rien).
"""

from collections.abc import AsyncIterator
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import src.models  # noqa: F401  (enregistre tous les modèles)
from src.models.base import Base
from src.models.client_mode import ContractData
from src.models.pdl import PDL
from src.models.user import User
from src.services.sync import SyncService

PRM = "99999999999991"
NO_DATA = {"success": False, "error": {"code": "NO_DATA", "message": "No consumption data available for this period"}}


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        user = User(email="client@example.org", hashed_password="x", client_id="cid", client_secret="x")
        session.add(user)
        await session.flush()
        session.add(PDL(usage_point_id=PRM, user_id=user.id))
        await session.commit()
        yield session
    await engine.dispose()


def make_service(db: AsyncSession) -> SyncService:
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    for name in ("get_consumption_detail", "get_consumption_daily", "get_production_daily", "get_consumption_max_power"):
        setattr(service.adapter, name, AsyncMock(return_value=NO_DATA))
    return service


def contract(consumption: date | None = None, production: date | None = None) -> ContractData:
    synthese = {}
    if consumption:
        synthese["consumption_last_activation_date"] = f"{consumption.isoformat()}T00:00:00+01:00"
    if production:
        synthese["generation_last_activation_date"] = f"{production.isoformat()}T00:00:00+01:00"
    return ContractData(usage_point_id=PRM, raw_data={"situation_contrat": [], "synthese_contrat": synthese})


def first_start(fetch: AsyncMock) -> date:
    return min(date.fromisoformat(call.args[1]) for call in fetch.call_args_list)


async def test_courbe_de_charge_bornee_a_la_mise_en_service(db: AsyncSession) -> None:
    activation = date.today() - timedelta(days=30)
    db.add(contract(consumption=activation))
    await db.commit()
    service = make_service(db)

    await service._sync_consumption_detail(PRM)

    fetch = service.adapter.get_consumption_detail
    assert first_start(fetch) == activation
    assert fetch.await_count == 5  # 30 jours par tranches de 7, au lieu d'une centaine sur 2 ans


async def test_journalier_et_puissance_max_bornes_aussi(db: AsyncSession) -> None:
    activation = date.today() - timedelta(days=100)
    db.add(contract(consumption=activation))
    await db.commit()
    service = make_service(db)

    await service._sync_consumption_daily(PRM)
    await service._sync_consumption_max_power(PRM)

    assert first_start(service.adapter.get_consumption_daily) == activation
    assert first_start(service.adapter.get_consumption_max_power) == activation


async def test_production_bornee_a_sa_propre_mise_en_service(db: AsyncSession) -> None:
    production = date.today() - timedelta(days=60)
    db.add(contract(consumption=date.today() - timedelta(days=2000), production=production))
    await db.commit()
    service = make_service(db)

    await service._sync_production_daily(PRM)

    assert first_start(service.adapter.get_production_daily) == production


async def test_sans_date_connue_fenetre_complete(db: AsyncSession) -> None:
    service = make_service(db)

    await service._sync_consumption_detail(PRM)

    assert first_start(service.adapter.get_consumption_detail) == date.today() - timedelta(days=730)


async def test_mise_en_service_ancienne_sans_effet(db: AsyncSession) -> None:
    db.add(contract(consumption=date(2014, 1, 22)))
    await db.commit()
    service = make_service(db)

    await service._sync_consumption_daily(PRM)

    assert first_start(service.adapter.get_consumption_daily) == date.today() - timedelta(days=1095)


async def test_date_du_pdl_si_contrat_absent(db: AsyncSession) -> None:
    activation = date.today() - timedelta(days=14)
    pdl = (await db.execute(select(PDL))).scalar_one()
    pdl.activation_date = activation
    await db.commit()
    service = make_service(db)

    await service._sync_consumption_detail(PRM)

    assert first_start(service.adapter.get_consumption_detail) == activation


async def test_liste_des_pdl_recopie_la_mise_en_service(db: AsyncSession) -> None:
    service = make_service(db)
    # Liste /pdl de la passerelle (PDLResponse, champ activation_date)
    service.adapter.get_usage_points = AsyncMock(
        return_value={"usage_points": [{"usage_point_id": PRM, "activation_date": "2026-01-10"}]}
    )

    await service.sync_pdl_list((await db.execute(select(User))).scalar_one().id)

    pdl = (await db.execute(select(PDL))).scalar_one()
    await db.refresh(pdl)
    assert pdl.activation_date == date(2026, 1, 10)


# Lectures de l'interface (routers/enedis_client.py) : même borne que la synchro


async def test_interface_ne_redemande_pas_avant_la_mise_en_service(db: AsyncSession) -> None:
    from src.routers.enedis_client import _after_activation

    activation = date.today() - timedelta(days=30)
    db.add(contract(consumption=activation))
    await db.commit()
    before = (activation - timedelta(days=60), activation - timedelta(days=53))
    spanning = (activation - timedelta(days=3), activation + timedelta(days=4))
    after = (activation + timedelta(days=10), activation + timedelta(days=17))

    ranges = await _after_activation(db, PRM, "consumption", [before, spanning, after])

    assert ranges == [(activation, spanning[1]), after]


async def test_interface_production_bornee_a_sa_propre_date(db: AsyncSession) -> None:
    from src.routers.enedis_client import _after_activation

    consumption, production = date.today() - timedelta(days=400), date.today() - timedelta(days=20)
    db.add(contract(consumption=consumption, production=production))
    await db.commit()
    old = (date.today() - timedelta(days=100), date.today() - timedelta(days=93))

    assert await _after_activation(db, PRM, "consumption", [old]) == [old]
    assert await _after_activation(db, PRM, "production", [old]) == []


async def test_interface_sans_date_connue_inchangee(db: AsyncSession) -> None:
    from src.routers.enedis_client import _after_activation

    old = (date.today() - timedelta(days=700), date.today() - timedelta(days=693))

    assert await _after_activation(db, PRM, "consumption", [old]) == [old]
    assert await _after_activation(db, PRM, "production", [old]) == [old]

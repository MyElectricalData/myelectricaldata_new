"""Mode client : synchro des PDL partagés avec l'admin (MED-112).

Seuls les PDL partagés CHOISIS (ligne locale avec shared_owner_id) sont synchronisés ; un partage
retiré côté passerelle purge le PDL et ses mesures. Un PDL du compte n'est jamais purgé, et une
liste des partages illisible ne purge rien.
"""

from collections.abc import AsyncIterator
from datetime import date
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import src.models  # noqa: F401  (enregistre tous les modèles)
from src.models.base import Base
from src.models.client_mode import ConsumptionData, DataGranularity, ProductionData
from src.models.pdl import PDL
from src.models.user import User
from src.services import sync as sync_module
from src.services.sync import SyncService

OWN = "11111111111111"
SHARED = "17167149025362"
SHARED_PROD = "17167149025363"
OWNER = "owner-uuid-1"


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        session.add(User(id="local-user", email="client@example.org", hashed_password="x", client_id="cid", client_secret="x"))
        session.add(PDL(id="p-own", usage_point_id=OWN, user_id="local-user"))
        session.add(PDL(id="p-shared", usage_point_id=SHARED, user_id="local-user", shared_owner_id=OWNER, name="ancien nom"))
        for upid in (OWN, SHARED):
            session.add(ConsumptionData(usage_point_id=upid, date=date(2026, 1, 1), granularity=DataGranularity.DAILY, value=1000))
        session.add(ProductionData(usage_point_id=SHARED, date=date(2026, 1, 1), granularity=DataGranularity.DAILY, value=500))
        await session.commit()
        yield session
    await engine.dispose()


@pytest.fixture(autouse=True)
def no_quota_block(monkeypatch):
    monkeypatch.setattr(sync_module, "_quota_blocked_until", None, raising=False)


def shared(usage_point_id: str, remote_id: str, **extra: Any) -> dict[str, Any]:
    return {"id": remote_id, "usage_point_id": usage_point_id, "name": f"Partagé {usage_point_id[-4:]}",
            "has_consumption": True, "has_production": False, "is_active": True,
            "owner_id": OWNER, "owner_email": "beaufils12@example.org", **extra}


def make_service(db: AsyncSession, shared_pdls: list[dict[str, Any]] | Exception) -> SyncService:
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    service.adapter.get_usage_points = AsyncMock(return_value={"usage_points": [{"usage_point_id": OWN}]})
    if isinstance(shared_pdls, Exception):
        service.adapter.get_shared_pdls = AsyncMock(side_effect=shared_pdls)
    else:
        service.adapter.get_shared_pdls = AsyncMock(return_value=shared_pdls)
    service.sync_pdl = AsyncMock(side_effect=lambda upid: {"usage_point_id": upid})
    return service


async def count(db: AsyncSession, model, usage_point_id: str) -> int:
    return (await db.execute(select(func.count()).select_from(model).where(model.usage_point_id == usage_point_id))).scalar_one()


async def test_pdl_partage_choisi_synchronise(db: AsyncSession) -> None:
    service = make_service(db, [shared(SHARED, "r-1"), shared("99999999999999", "r-9")])

    result = await service.sync_all()

    synced = [c.args[0] for c in service.sync_pdl.await_args_list]
    assert synced == [OWN, SHARED]  # le partage non choisi (999…) n'est pas synchronisé
    pdl = (await db.execute(select(PDL).where(PDL.usage_point_id == SHARED))).scalar_one()
    assert pdl.name == "Partagé 5362" and pdl.shared_owner_email == "beaufils12@example.org"
    service.adapter.set_shared_owners.assert_called_with({SHARED: OWNER})
    assert result["shared_purged"] == []


async def test_partage_retire_purge_pdl_et_mesures(db: AsyncSession) -> None:
    service = make_service(db, [])

    result = await service.sync_all()

    assert result["shared_purged"] == [SHARED]
    assert (await db.execute(select(PDL).where(PDL.usage_point_id == SHARED))).scalar_one_or_none() is None
    assert await count(db, ConsumptionData, SHARED) == 0
    assert await count(db, ProductionData, SHARED) == 0
    # PDL du compte et ses mesures intacts
    assert await count(db, ConsumptionData, OWN) == 1
    assert [c.args[0] for c in service.sync_pdl.await_args_list] == [OWN]
    service.adapter.set_shared_owners.assert_called_with({})


async def test_liste_illisible_ne_purge_rien(db: AsyncSession) -> None:
    request = httpx.Request("GET", "https://gw.test/api/admin/shared-pdls")
    error = httpx.HTTPStatusError("403", request=request, response=httpx.Response(403, request=request))
    service = make_service(db, error)

    result = await service.sync_all()

    assert await count(db, ConsumptionData, SHARED) == 1
    assert [c.args[0] for c in service.sync_pdl.await_args_list] == [OWN, SHARED]
    assert any("PDL partagés" in e["error"] for e in result["errors"])


async def test_sans_partage_choisi_aucun_appel_admin(db: AsyncSession) -> None:
    await db.delete(await db.get(PDL, "p-shared"))
    await db.commit()
    service = make_service(db, [])

    await service.sync_all()

    service.adapter.get_shared_pdls.assert_not_called()


async def test_deux_synchros_meme_etat(db: AsyncSession) -> None:
    for _ in range(2):
        await make_service(db, [shared(SHARED, "r-1")]).sync_all()
    rows = (await db.execute(select(PDL.usage_point_id, PDL.shared_owner_id).order_by(PDL.usage_point_id))).all()
    assert rows == [(OWN, None), (SHARED, OWNER)]
    assert await count(db, ConsumptionData, SHARED) == 1


async def test_liaison_production_entre_pdl_partages(db: AsyncSession) -> None:
    db.add(PDL(id="p-shared-prod", usage_point_id=SHARED_PROD, user_id="local-user", shared_owner_id=OWNER))
    await db.commit()
    service = make_service(db, [shared(SHARED, "r-1", linked_production_pdl_id="r-2"),
                                shared(SHARED_PROD, "r-2", has_consumption=False, has_production=True)])

    await service.sync_all()

    pdl = (await db.execute(select(PDL).where(PDL.usage_point_id == SHARED).execution_options(populate_existing=True))).scalar_one()
    assert pdl.linked_production_pdl_id == "p-shared-prod"


async def test_pdl_revenu_dans_le_compte_n_est_plus_partage(db: AsyncSession) -> None:
    service = make_service(db, [])
    service.adapter.get_usage_points = AsyncMock(return_value={"usage_points": [{"usage_point_id": SHARED, "name": "à moi"}]})

    await service.sync_pdl_list("local-user")
    await service.sync_all()

    pdl = (await db.execute(select(PDL).where(PDL.usage_point_id == SHARED))).scalar_one()
    assert pdl.shared_owner_id is None
    assert await count(db, ConsumptionData, SHARED) == 1


# --- Choix PDL par PDL depuis l'écran du client (étape 7) ---


async def test_liste_des_partages_avec_etat_de_choix(db: AsyncSession) -> None:
    service = make_service(db, [shared(SHARED, "r-1"), shared("99999999999999", "r-9"), shared(OWN, "r-own")])

    choices = {c["usage_point_id"]: c for c in await service.list_shared_choices()}

    assert choices[SHARED]["selected"] is True and choices[SHARED]["own"] is False
    assert choices["99999999999999"]["selected"] is False and choices["99999999999999"]["own"] is False
    assert choices[OWN]["own"] is True and choices[OWN]["selected"] is False
    assert choices[SHARED]["owner_email"] == "beaufils12@example.org"


async def test_cocher_cree_le_pdl_partage_et_sa_liaison(db: AsyncSession) -> None:
    service = make_service(db, [
        shared(SHARED, "r-1", linked_production_pdl_id="r-2"),
        shared(SHARED_PROD, "r-2", has_consumption=False, has_production=True),
    ])

    await service.select_shared_pdl(SHARED_PROD, "local-user")

    prod = (await db.execute(select(PDL).where(PDL.usage_point_id == SHARED_PROD))).scalar_one()
    conso = (await db.execute(select(PDL).where(PDL.usage_point_id == SHARED))).scalar_one()
    assert prod.shared_owner_id == OWNER and prod.has_production is True
    assert conso.linked_production_pdl_id == prod.id
    service.adapter.set_shared_owners.assert_called_with({SHARED: OWNER, SHARED_PROD: OWNER})


async def test_cocher_refuse_un_pdl_du_compte_ou_non_partage(db: AsyncSession) -> None:
    service = make_service(db, [shared(OWN, "r-own")])

    with pytest.raises(ValueError):
        await service.select_shared_pdl(OWN, "local-user")
    with pytest.raises(LookupError):
        await service.select_shared_pdl("99999999999999", "local-user")
    own = (await db.execute(select(PDL).where(PDL.usage_point_id == OWN))).scalar_one()
    assert own.shared_owner_id is None


async def test_decocher_purge_mais_jamais_un_pdl_du_compte(db: AsyncSession) -> None:
    service = make_service(db, [])

    assert await service.unselect_shared_pdl(OWN) is False
    assert await service.unselect_shared_pdl(SHARED) is True

    assert await count(db, ConsumptionData, OWN) == 1
    assert await count(db, ConsumptionData, SHARED) == 0
    assert await count(db, ProductionData, SHARED) == 0
    assert (await db.execute(select(PDL).where(PDL.usage_point_id == SHARED))).scalar_one_or_none() is None
    service.adapter.set_shared_owners.assert_called_with({})

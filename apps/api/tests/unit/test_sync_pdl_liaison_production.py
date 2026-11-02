"""Mode client : la synchro de la liste des PDL recopie la liaison consommation / production (MED-112)

Le Bilan énergétique oppose la consommation d'un PDL à la production d'un autre, liés par
`linked_production_pdl_id`. Côté passerelle ce champ est l'UUID du PDL de production DANS LA BASE
DISTANTE ; le client local a ses propres UUID, la liaison doit donc être traduite par `usage_point_id`.
"""

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import src.models  # noqa: F401  (enregistre tous les modèles)
from src.models.base import Base
from src.models.pdl import PDL
from src.models.user import User
from src.services.sync import SyncService

CONSO = "17167149025362"
PROD = "17167149025363"

# UUID de la base DISTANTE, volontairement différents de ceux que le client génère
REMOTE_CONSO_ID = "11111111-1111-4111-8111-111111111111"
REMOTE_PROD_ID = "22222222-2222-4222-8222-222222222222"


@pytest.fixture
async def db() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        session.add(User(id="local-user", email="client@example.org", hashed_password="x", client_id="cid", client_secret="x"))
        await session.commit()
        yield session
    await engine.dispose()


def remote(usage_point_id: str, remote_id: str, **extra: Any) -> dict[str, Any]:
    return {
        "id": remote_id,
        "usage_point_id": usage_point_id,
        "name": f"PDL {usage_point_id[-4:]}",
        "has_consumption": True,
        "has_production": False,
        "is_active": True,
        **extra,
    }


def make_service(db: AsyncSession, usage_points: list[dict[str, Any]]) -> SyncService:
    service = SyncService.__new__(SyncService)
    service.db = db
    service.adapter = MagicMock()
    service.adapter.get_usage_points = AsyncMock(return_value={"usage_points": usage_points})
    return service


async def local_pdl(db: AsyncSession, usage_point_id: str) -> PDL:
    # populate_existing : relit la ligne en base sans périmer les autres objets de la session
    query = select(PDL).where(PDL.usage_point_id == usage_point_id).execution_options(populate_existing=True)
    return (await db.execute(query)).scalar_one()


async def test_liaison_traduite_en_uuid_local_a_la_creation(db: AsyncSession) -> None:
    service = make_service(
        db,
        [
            remote(CONSO, REMOTE_CONSO_ID, linked_production_pdl_id=REMOTE_PROD_ID),
            remote(PROD, REMOTE_PROD_ID, has_consumption=False, has_production=True),
        ],
    )

    await service.sync_pdl_list("local-user")

    conso, prod = await local_pdl(db, CONSO), await local_pdl(db, PROD)
    assert conso.linked_production_pdl_id == prod.id
    # L'UUID distant ne doit surtout pas fuiter dans la base locale (clé étrangère vers pdls.id)
    assert conso.linked_production_pdl_id != REMOTE_PROD_ID


async def test_liaison_resolue_quel_que_soit_l_ordre_de_la_liste(db: AsyncSession) -> None:
    """La production peut arriver AVANT la consommation, ou après : la liaison ne dépend pas de l'ordre."""
    service = make_service(
        db,
        [
            remote(PROD, REMOTE_PROD_ID, has_consumption=False, has_production=True),
            remote(CONSO, REMOTE_CONSO_ID, linked_production_pdl_id=REMOTE_PROD_ID),
        ],
    )

    await service.sync_pdl_list("local-user")

    assert (await local_pdl(db, CONSO)).linked_production_pdl_id == (await local_pdl(db, PROD)).id


async def test_liaison_ajoutee_sur_un_pdl_deja_present_localement(db: AsyncSession) -> None:
    first = make_service(
        db,
        [remote(CONSO, REMOTE_CONSO_ID), remote(PROD, REMOTE_PROD_ID, has_consumption=False, has_production=True)],
    )
    await first.sync_pdl_list("local-user")
    assert (await local_pdl(db, CONSO)).linked_production_pdl_id is None

    second = make_service(
        db,
        [
            remote(CONSO, REMOTE_CONSO_ID, linked_production_pdl_id=REMOTE_PROD_ID),
            remote(PROD, REMOTE_PROD_ID, has_consumption=False, has_production=True),
        ],
    )
    await second.sync_pdl_list("local-user")

    assert (await local_pdl(db, CONSO)).linked_production_pdl_id == (await local_pdl(db, PROD)).id


async def test_liaison_retiree_cote_passerelle_est_retiree_en_local(db: AsyncSession) -> None:
    linked = make_service(
        db,
        [
            remote(CONSO, REMOTE_CONSO_ID, linked_production_pdl_id=REMOTE_PROD_ID),
            remote(PROD, REMOTE_PROD_ID, has_consumption=False, has_production=True),
        ],
    )
    await linked.sync_pdl_list("local-user")
    assert (await local_pdl(db, CONSO)).linked_production_pdl_id is not None

    unlinked = make_service(
        db,
        [
            remote(CONSO, REMOTE_CONSO_ID, linked_production_pdl_id=None),
            remote(PROD, REMOTE_PROD_ID, has_consumption=False, has_production=True),
        ],
    )
    await unlinked.sync_pdl_list("local-user")

    assert (await local_pdl(db, CONSO)).linked_production_pdl_id is None


async def test_liaison_vers_un_pdl_absent_de_la_liste_reste_vide(db: AsyncSession) -> None:
    """Une cible inconnue localement (PDL non synchronisé) ne casse pas la synchro et ne laisse pas d'UUID orphelin."""
    service = make_service(db, [remote(CONSO, REMOTE_CONSO_ID, linked_production_pdl_id=REMOTE_PROD_ID)])

    await service.sync_pdl_list("local-user")

    assert (await local_pdl(db, CONSO)).linked_production_pdl_id is None

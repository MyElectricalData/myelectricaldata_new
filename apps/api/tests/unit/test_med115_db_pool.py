"""MED-115 : libération des transactions de jeton et dimensionnement du pool PostgreSQL."""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.models import Base, Token
from src.models.database import make_engine
from src.routers import enedis as router
from tests.unit.test_enedis_fin_exclue import PRM, USER


@pytest.fixture
async def db_jeton() -> AsyncIterator[AsyncSession]:
    """Utiliser les vrais modèles et une session SQLite indépendante, sans serveur externe."""
    engine = make_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.begin() as connexion:
            await connexion.run_sync(Base.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with sessions() as db:
            yield db
    finally:
        await engine.dispose()


@pytest.mark.parametrize("expire", [False, True], ids=["valide", "renouvele"])
async def test_jeton_global_ne_laisse_aucune_transaction_ouverte(db_jeton, monkeypatch, expire):
    """La lecture d'un jeton valide ou son renouvellement libère la transaction avant de rendre le jeton."""
    db_jeton.add(
        Token(
            user_id=None,
            usage_point_id="__global__",
            access_token="ancien_jeton",
            token_type="Bearer",
            expires_at=datetime.now(UTC) + timedelta(hours=-1 if expire else 1),
        )
    )
    await db_jeton.commit()
    assert not db_jeton.in_transaction(), "La préparation ne doit pas laisser de transaction ouverte"
    monkeypatch.setattr(router.demo_adapter, "is_demo_user", AsyncMock(return_value=False))
    monkeypatch.setattr(router, "verify_pdl_ownership", AsyncMock(return_value=True))
    renouvellement = AsyncMock(return_value={"access_token": "nouveau_jeton", "expires_in": 3600})
    monkeypatch.setattr(router.enedis_adapter, "get_client_credentials_token", renouvellement)

    jeton = await router.get_valid_token(PRM, USER, db_jeton)

    assert jeton == ("nouveau_jeton" if expire else "ancien_jeton")
    if expire:
        renouvellement.assert_awaited_once_with()
    else:
        renouvellement.assert_not_called()
    assert not db_jeton.in_transaction(), "get_valid_token laisse la session idle in transaction"


@pytest.mark.parametrize(
    "reglage",
    ["pool_size", "max_overflow", "pool_timeout"],
)
async def test_pool_postgresql_est_dimensionne_explicitement(reglage):
    """Le pool PostgreSQL réel dépasse 5 connexions et 10 débordements, avec moins de 30 secondes d'attente."""
    # create_async_engine est paresseux : aucune connexion PostgreSQL n'est ouverte.
    engine = make_engine("postgresql+asyncpg://u:p@h/db")
    try:
        if reglage == "pool_size":
            assert engine.pool.size() > 5, "pool_size doit dépasser la valeur par défaut de 5"
        elif reglage == "max_overflow":
            assert engine.pool._max_overflow > 10, "max_overflow doit dépasser la valeur par défaut de 10"
        else:
            assert engine.pool._timeout < 30, "pool_timeout doit être inférieur à la valeur par défaut de 30 s"
    finally:
        await engine.dispose()


async def test_moteur_sqlite_reste_utilisable():
    """Une URL SQLite crée toujours un moteur fonctionnel après le réglage du pool PostgreSQL."""
    engine = make_engine("sqlite+aiosqlite:///:memory:")
    try:
        async with engine.connect() as connexion:
            assert (await connexion.execute(text("SELECT 1"))).scalar_one() == 1
    finally:
        await engine.dispose()

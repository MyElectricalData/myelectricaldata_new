from collections.abc import AsyncGenerator
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine, AsyncSession, async_sessionmaker
from .base import Base
from ..config import settings
from ..config.sqlite import BUSY_TIMEOUT_MS, apply_sqlite_pragmas, is_sqlite_url, prepare_sqlite_file


def make_engine(url: str) -> AsyncEngine:
    """Moteur de la base : PostgreSQL tel quel, SQLite avec son dossier et ses PRAGMA (MED-65)."""
    if not is_sqlite_url(url):
        # Pool dimensionné explicitement (MED-115) : une attente de connexion courte échoue vite
        # au lieu de bloquer 30 s, pre_ping écarte les connexions coupées par PostgreSQL.
        return create_async_engine(
            url,
            echo=settings.DEBUG_SQL,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE,
            pool_pre_ping=True,
        )
    sqlite_engine = create_async_engine(
        url, echo=settings.DEBUG_SQL, connect_args={"timeout": BUSY_TIMEOUT_MS / 1000}
    )
    # Dossier créé à la première connexion, pas à l'import : aucun effet de bord sans usage de la base
    event.listen(sqlite_engine.sync_engine, "do_connect", lambda *_: prepare_sqlite_file(url))
    event.listen(sqlite_engine.sync_engine, "connect", apply_sqlite_pragmas)
    return sqlite_engine


engine = make_engine(settings.DATABASE_URL)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db() -> None:
    """Initialize the database: create tables and seed default data."""
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed default roles and permissions
    from .seed import (
        init_default_roles_and_permissions,
        init_default_energy_offers,
        sync_admin_users,
    )
    async with async_session_maker() as session:
        await init_default_roles_and_permissions(session)

    # NOTE: Les types d'offres (PricingType) sont maintenant gérés via OfferRegistry
    # dans services/offers/registry.py (auto-discovery des calculateurs Python)

    # Seed default energy provider (EDF) and offers (mode serveur uniquement)
    # En mode client, les providers et offres sont synchronisés depuis la gateway
    if not settings.CLIENT_MODE:
        async with async_session_maker() as session:
            await init_default_energy_offers(session)

    # Ensure ADMIN_EMAILS users have admin role (runs every startup)
    async with async_session_maker() as session:
        await sync_admin_users(session)

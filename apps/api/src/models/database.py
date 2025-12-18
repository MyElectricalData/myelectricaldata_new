from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from .base import Base
from ..config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG_SQL)
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
    from .seed import init_default_roles_and_permissions, sync_admin_users
    async with async_session_maker() as session:
        await init_default_roles_and_permissions(session)

    # Ensure ADMIN_EMAILS users have admin role (runs every startup)
    async with async_session_maker() as session:
        await sync_admin_users(session)

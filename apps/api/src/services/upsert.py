"""INSERT … ON CONFLICT pour la base du client local : PostgreSQL ou SQLite (MED-65).

Les deux dialectes ont leur `insert()` avec `on_conflict_do_update` / `on_conflict_do_nothing`, mais
SQLite ne sait pas viser une contrainte par son nom : il faut ses colonnes, et pour les lignes
quotidiennes (interval_start NULL) l'index partiel qui remplace NULLS NOT DISTINCT
(`daily_unique_index` des modèles). Sous PostgreSQL, la requête reste celle d'avant.
"""

from typing import Any

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

# Clé naturelle de consumption_data / production_data (contraintes uq_<table>)
ENERGY_KEY = ("usage_point_id", "date", "granularity", "interval_start")


def is_sqlite(db: AsyncSession) -> bool:
    return db.get_bind().dialect.name == "sqlite"


def dialect_insert(db: AsyncSession, model: type) -> Any:
    """`insert()` du dialecte de la session (PostgreSQL par défaut)."""
    return sqlite_insert(model) if is_sqlite(db) else pg_insert(model)


def conflict_target(db: AsyncSession, constraint: str, columns: tuple[str, ...], *, daily: bool = False) -> dict[str, Any]:
    """Arguments de cible de ON CONFLICT : la contrainte nommée sous PostgreSQL, ses colonnes sous SQLite.

    `daily` : lignes à interval_start NULL, que seul l'index partiel des lignes quotidiennes rend uniques
    sous SQLite.
    """
    if not is_sqlite(db):
        return {"constraint": constraint}
    if daily:
        return daily_index_target(columns)
    return {"index_elements": list(columns)}


def daily_index_target(columns: tuple[str, ...]) -> dict[str, Any]:
    """Cible ON CONFLICT de l'index partiel uq_<table>_daily (interval_start NULL).

    SQLite l'a dès la création (MED-65) ; PostgreSQL < 15 le reçoit par la migration b8d1f3a5c7e9
    (MED-103), faute de NULLS NOT DISTINCT. Même syntaxe dans les deux dialectes.
    """
    return {
        "index_elements": [column for column in columns if column != "interval_start"],
        "index_where": text("interval_start IS NULL"),
    }


async def sqlite_index_exists(db: AsyncSession, name: str) -> bool:
    result = await db.execute(
        text("SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = :name"), {"name": name}
    )
    return bool(result.scalar())


async def index_exists(db: AsyncSession, name: str) -> bool:
    """Index `name` présent dans la base de la session (SQLite ou PostgreSQL)."""
    if is_sqlite(db):
        return await sqlite_index_exists(db, name)
    result = await db.execute(text("SELECT count(*) FROM pg_indexes WHERE indexname = :name"), {"name": name})
    return bool(result.scalar())

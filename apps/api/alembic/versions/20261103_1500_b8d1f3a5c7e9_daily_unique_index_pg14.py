"""Unique daily rows on PostgreSQL < 15: purge duplicates, add a partial unique index (MED-103, issue #201)

Revision ID: b8d1f3a5c7e9
Revises: a7c2e9d4b1f0
Create Date: 2026-11-03 15:00:00

c3d4e5f6g7h8 skips PostgreSQL < 15 (no NULLS NOT DISTINCT): daily rows (interval_start NULL)
were never caught by ON CONFLICT, and every sync stored one more copy of each day, which doubled
the yearly totals of the local client. A partial unique index on the daily rows gives the same
guarantee on every PostgreSQL version, the way SQLite does since MED-65 (uq_<table>_daily).

Runs only where the constraint lacks NULLS NOT DISTINCT; no-op on PostgreSQL 15+ and SQLite.
Idempotent. Keeps, for each day, the row updated last (latest value sent by Enedis).
"""

import logging
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "b8d1f3a5c7e9"
down_revision: Union[str, None] = "a7c2e9d4b1f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

TABLES = ("consumption_data", "production_data")


def _needs_partial_index(table: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    definition = bind.execute(
        text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = :name"), {"name": f"uq_{table}"}
    ).scalar()
    return "NULLS NOT DISTINCT" not in (definition or "")


def _delete_daily_duplicates_sql(table: str) -> str:
    """Delete the extra copies of daily rows, keeping the one updated last."""
    return f"""
        DELETE FROM {table}
        WHERE id IN (
            SELECT id FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY usage_point_id, date, granularity
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                ) AS rn
                FROM {table}
                WHERE interval_start IS NULL
            ) ranked
            WHERE rn > 1
        )
    """


def upgrade() -> None:
    for table in TABLES:
        if not _needs_partial_index(table):
            continue
        deleted = op.get_bind().execute(text(_delete_daily_duplicates_sql(table))).rowcount
        logger.warning(f"{table}: {deleted} duplicate daily row(s) removed, adding partial unique index")
        op.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS uq_{table}_daily "
            f"ON {table} (usage_point_id, date, granularity) WHERE interval_start IS NULL"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    for table in TABLES:
        # Only the index created by upgrade(): on PostgreSQL 15+, the constraint already covers it
        if _needs_partial_index(table):
            op.execute(f"DROP INDEX IF EXISTS uq_{table}_daily")

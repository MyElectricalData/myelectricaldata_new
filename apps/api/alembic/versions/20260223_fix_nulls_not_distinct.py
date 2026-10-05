"""Fix unique constraints to use NULLS NOT DISTINCT

For daily records, interval_start is NULL. PostgreSQL treats NULLs as distinct
in unique constraints by default, which means ON CONFLICT never fires for daily
records and duplicates can be inserted. This migration removes the duplicates
already stored, then recreates the constraints with NULLS NOT DISTINCT
(PostgreSQL 15+).

On PostgreSQL < 15 (external database set through DATABASE_URL), the migration
is skipped with a warning: the old constraint stays in place, so the API keeps
working, with duplicate daily rows still possible.

Revision ID: c3d4e5f6g7h8
Revises: c9d3e7f1a2b4
Create Date: 2026-02-23

"""
import logging
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6g7h8"
down_revision: Union[str, None] = "c9d3e7f1a2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

TABLES = ("consumption_data", "production_data")
KEY = "usage_point_id, date, granularity, interval_start"


def _supports_nulls_not_distinct() -> bool:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    version = bind.exec_driver_sql("SHOW server_version_num").scalar()
    return int(version) >= 150000


def _delete_duplicates_sql(table: str) -> str:
    """DELETE des doublons de `table` sur la clé KEY, NULL compris (interval_start des mesures quotidiennes).

    Garde la ligne mise à jour en dernier : la dernière valeur envoyée par Enedis, corrections comprises.
    PARTITION BY regroupe les NULL entre eux, ce que ne fait pas la contrainte UNIQUE d'origine.
    """
    return f"""
        DELETE FROM {table}
        WHERE id IN (
            SELECT id FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY {KEY}
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                ) AS rn
                FROM {table}
            ) ranked
            WHERE rn > 1
        )
    """


def upgrade() -> None:
    if not _supports_nulls_not_distinct():
        logger.warning(
            "NULLS NOT DISTINCT requires PostgreSQL 15+: unique constraints left unchanged, "
            "duplicate daily rows remain possible"
        )
        return

    for table in TABLES:
        op.execute(_delete_duplicates_sql(table))
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS uq_{table}")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT uq_{table} UNIQUE NULLS NOT DISTINCT ({KEY})")


def downgrade() -> None:
    if not _supports_nulls_not_distinct():
        return

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS uq_{table}")
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT uq_{table} UNIQUE ({KEY})")

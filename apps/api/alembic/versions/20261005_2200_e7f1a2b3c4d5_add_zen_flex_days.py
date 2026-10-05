"""Add zen_flex_days table (calendrier EDF Zen Flex, MED-27)

Revision ID: e7f1a2b3c4d5
Revises: c3d4e5f6g7h8
Create Date: 2026-10-05 22:00:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "e7f1a2b3c4d5"
down_revision: Union[str, None] = "c3d4e5f6g7h8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    """Vérifie si une table existe déjà dans la base de données."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # init_db peut avoir créé la table (create_all) avant le passage d'Alembic
    if not table_exists("zen_flex_days"):
        op.create_table(
            "zen_flex_days",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("day_type", sa.String(length=10), nullable=False),
            sa.Column("raw_value", sa.String(length=32), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_zen_flex_days_date", "zen_flex_days", ["date"], unique=True)


def downgrade() -> None:
    if table_exists("zen_flex_days"):
        op.drop_index("ix_zen_flex_days_date", table_name="zen_flex_days")
        op.drop_table("zen_flex_days")

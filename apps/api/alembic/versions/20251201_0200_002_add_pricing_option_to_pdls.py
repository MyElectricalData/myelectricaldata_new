"""Add pricing_option to pdls table

Revision ID: 002
Revises: 001
Create Date: 2025-12-01 02:00:00

Adds the pricing_option column to the pdls table if it doesn't exist.
This column stores the tariff type: BASE, HC_HP, TEMPO, EJP, HC_WEEKEND.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # PostgreSQL - use IF NOT EXISTS pattern via DO block
        op.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'pdls' AND column_name = 'pricing_option'
                ) THEN
                    ALTER TABLE pdls ADD COLUMN pricing_option VARCHAR(50);
                END IF;
            END $$;
        """)
    else:
        # SQLite - no IF NOT EXISTS for ALTER TABLE, need to check first
        try:
            op.add_column("pdls", sa.Column("pricing_option", sa.String(50), nullable=True))
        except Exception:
            # Column already exists
            pass


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("ALTER TABLE pdls DROP COLUMN IF EXISTS pricing_option")
    else:
        # SQLite doesn't support DROP COLUMN easily, leave it
        pass

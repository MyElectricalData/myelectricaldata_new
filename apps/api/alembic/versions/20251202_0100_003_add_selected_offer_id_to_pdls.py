"""Add selected_offer_id to pdls table

Revision ID: 003
Revises: 002
Create Date: 2025-12-02 01:00:00

Adds the selected_offer_id column to the pdls table to allow users
to select an energy offer for their PDL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
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
                    WHERE table_name = 'pdls' AND column_name = 'selected_offer_id'
                ) THEN
                    ALTER TABLE pdls ADD COLUMN selected_offer_id VARCHAR(36);
                END IF;
            END $$;
        """)
        # Add foreign key constraint if it doesn't exist
        op.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'fk_pdls_selected_offer_id'
                ) THEN
                    ALTER TABLE pdls
                    ADD CONSTRAINT fk_pdls_selected_offer_id
                    FOREIGN KEY (selected_offer_id) REFERENCES energy_offers(id)
                    ON DELETE SET NULL;
                END IF;
            END $$;
        """)
    else:
        # SQLite - no IF NOT EXISTS for ALTER TABLE, need to check first
        try:
            op.add_column("pdls", sa.Column("selected_offer_id", sa.String(36), nullable=True))
        except Exception:
            # Column already exists
            pass


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("ALTER TABLE pdls DROP CONSTRAINT IF EXISTS fk_pdls_selected_offer_id")
        op.execute("ALTER TABLE pdls DROP COLUMN IF EXISTS selected_offer_id")
    else:
        # SQLite doesn't support DROP COLUMN easily, leave it
        pass

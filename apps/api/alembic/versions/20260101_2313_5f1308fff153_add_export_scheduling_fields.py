"""Add export scheduling fields

Revision ID: 5f1308fff153
Revises: 007
Create Date: 2026-01-01 23:13:27.895576

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5f1308fff153'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add scheduling columns to export_configs
    op.add_column('export_configs', sa.Column('export_interval_minutes', sa.Integer(), nullable=True))
    op.add_column('export_configs', sa.Column('next_export_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('export_configs', 'next_export_at')
    op.drop_column('export_configs', 'export_interval_minutes')

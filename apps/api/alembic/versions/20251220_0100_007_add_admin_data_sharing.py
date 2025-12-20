"""add admin_data_sharing to users

Revision ID: 007
Revises: 006
Create Date: 2025-12-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add admin_data_sharing columns to users table
    op.add_column('users', sa.Column('admin_data_sharing', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('admin_data_sharing_enabled_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Remove admin_data_sharing columns from users table
    op.drop_column('users', 'admin_data_sharing_enabled_at')
    op.drop_column('users', 'admin_data_sharing')

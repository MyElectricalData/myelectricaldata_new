"""Add contribution_messages table

Revision ID: 004
Revises: 003
Create Date: 2025-12-05 01:00:00

Adds the contribution_messages table to store messages exchanged
between admins and contributors about offer contributions.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # PostgreSQL - use IF NOT EXISTS for idempotent migrations
        op.execute("""
            CREATE TABLE IF NOT EXISTS contribution_messages (
                id VARCHAR(36) PRIMARY KEY,
                contribution_id VARCHAR(36) NOT NULL REFERENCES offer_contributions(id) ON DELETE CASCADE,
                sender_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message_type VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                is_from_admin BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)
        # Add index on contribution_id for faster lookups
        op.execute("""
            CREATE INDEX IF NOT EXISTS ix_contribution_messages_contribution_id
            ON contribution_messages(contribution_id)
        """)
    else:
        # SQLite
        op.execute("""
            CREATE TABLE IF NOT EXISTS contribution_messages (
                id VARCHAR(36) PRIMARY KEY,
                contribution_id VARCHAR(36) NOT NULL REFERENCES offer_contributions(id) ON DELETE CASCADE,
                sender_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message_type VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                is_from_admin BOOLEAN NOT NULL DEFAULT FALSE,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        op.execute("""
            CREATE INDEX IF NOT EXISTS ix_contribution_messages_contribution_id
            ON contribution_messages(contribution_id)
        """)


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_contribution_messages_contribution_id")
        op.execute("DROP TABLE IF EXISTS contribution_messages")
    else:
        op.execute("DROP INDEX IF EXISTS ix_contribution_messages_contribution_id")
        op.execute("DROP TABLE IF EXISTS contribution_messages")

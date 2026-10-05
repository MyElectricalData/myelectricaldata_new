"""Add max_power_data table for client mode.

Revision ID: c9d3e7f1a2b4
Revises: b2c3d4e5f6g7
Create Date: 2026-02-16 12:30:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c9d3e7f1a2b4"
down_revision: Union[str, None] = "b2c3d4e5f6g7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute(
            """
            CREATE TABLE IF NOT EXISTS max_power_data (
                id VARCHAR(36) PRIMARY KEY,
                usage_point_id VARCHAR(14) NOT NULL,
                date DATE NOT NULL,
                interval_start VARCHAR(5),
                value INTEGER NOT NULL,
                source VARCHAR(50) DEFAULT 'myelectricaldata',
                raw_data JSONB,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_max_power_data UNIQUE (usage_point_id, date)
            )
            """
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_max_power_usage_point_date ON max_power_data(usage_point_id, date)"
        )
        op.execute("CREATE INDEX IF NOT EXISTS ix_max_power_date ON max_power_data(date)")
    else:
        op.create_table(
            "max_power_data",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("usage_point_id", sa.String(length=14), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("interval_start", sa.String(length=5), nullable=True),
            sa.Column("value", sa.Integer(), nullable=False),
            sa.Column("source", sa.String(length=50), nullable=True, server_default="myelectricaldata"),
            sa.Column("raw_data", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("usage_point_id", "date", name="uq_max_power_data"),
        )
        op.create_index(
            "ix_max_power_usage_point_date",
            "max_power_data",
            ["usage_point_id", "date"],
        )
        op.create_index("ix_max_power_date", "max_power_data", ["date"])


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_max_power_usage_point_date")
        op.execute("DROP INDEX IF EXISTS ix_max_power_date")
        op.execute("DROP TABLE IF EXISTS max_power_data")
    else:
        op.drop_index("ix_max_power_usage_point_date", table_name="max_power_data")
        op.drop_index("ix_max_power_date", table_name="max_power_data")
        op.drop_table("max_power_data")

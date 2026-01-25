"""Create client mode tables

Revision ID: 008
Revises: 007
Create Date: 2025-12-30 01:00:00

Creates tables for CLIENT_MODE:
- consumption_data: Daily and detailed consumption data
- production_data: Daily and detailed production data
- sync_status: Sync status per PDL
- export_configs: Export configurations (HA, MQTT, VM)
- contract_data: Contract information cache
- address_data: Address information cache
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '008'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # Create enum types (PostgreSQL doesn't support IF NOT EXISTS for CREATE TYPE)
        # Use DO block to handle existing types gracefully
        op.execute("""
            DO $$ BEGIN
                CREATE TYPE datagranularity AS ENUM ('daily', 'detailed');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """)
        op.execute("""
            DO $$ BEGIN
                CREATE TYPE syncstatustype AS ENUM ('pending', 'running', 'success', 'failed', 'partial');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """)
        op.execute("""
            DO $$ BEGIN
                CREATE TYPE exporttype AS ENUM ('home_assistant', 'mqtt', 'victoriametrics');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """)

        # consumption_data table
        op.execute("""
            CREATE TABLE IF NOT EXISTS consumption_data (
                id VARCHAR(36) PRIMARY KEY,
                usage_point_id VARCHAR(14) NOT NULL,
                date DATE NOT NULL,
                granularity datagranularity NOT NULL,
                interval_start VARCHAR(5),
                value INTEGER NOT NULL,
                source VARCHAR(50) DEFAULT 'myelectricaldata',
                raw_data JSONB,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_consumption_data UNIQUE (usage_point_id, date, granularity, interval_start)
            )
        """)
        op.execute("CREATE INDEX IF NOT EXISTS ix_consumption_usage_point_date ON consumption_data(usage_point_id, date)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_consumption_granularity_date ON consumption_data(granularity, date)")

        # production_data table
        op.execute("""
            CREATE TABLE IF NOT EXISTS production_data (
                id VARCHAR(36) PRIMARY KEY,
                usage_point_id VARCHAR(14) NOT NULL,
                date DATE NOT NULL,
                granularity datagranularity NOT NULL,
                interval_start VARCHAR(5),
                value INTEGER NOT NULL,
                source VARCHAR(50) DEFAULT 'myelectricaldata',
                raw_data JSONB,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_production_data UNIQUE (usage_point_id, date, granularity, interval_start)
            )
        """)
        op.execute("CREATE INDEX IF NOT EXISTS ix_production_usage_point_date ON production_data(usage_point_id, date)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_production_granularity_date ON production_data(granularity, date)")

        # sync_status table
        op.execute("""
            CREATE TABLE IF NOT EXISTS sync_status (
                id VARCHAR(36) PRIMARY KEY,
                usage_point_id VARCHAR(14) NOT NULL,
                data_type VARCHAR(20) NOT NULL,
                granularity datagranularity NOT NULL,
                status syncstatustype DEFAULT 'pending',
                last_sync_at TIMESTAMP WITH TIME ZONE,
                next_sync_at TIMESTAMP WITH TIME ZONE,
                oldest_data_date DATE,
                newest_data_date DATE,
                total_records INTEGER DEFAULT 0,
                records_synced_last_run INTEGER DEFAULT 0,
                error_message TEXT,
                error_count INTEGER DEFAULT 0,
                last_error_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_sync_status UNIQUE (usage_point_id, data_type, granularity)
            )
        """)
        op.execute("CREATE INDEX IF NOT EXISTS ix_sync_status_usage_point_id ON sync_status(usage_point_id)")

        # export_configs table
        op.execute("""
            CREATE TABLE IF NOT EXISTS export_configs (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                export_type exporttype NOT NULL,
                config JSONB NOT NULL DEFAULT '{}',
                usage_point_ids JSONB,
                is_enabled BOOLEAN DEFAULT TRUE,
                export_consumption BOOLEAN DEFAULT TRUE,
                export_production BOOLEAN DEFAULT TRUE,
                export_detailed BOOLEAN DEFAULT FALSE,
                last_export_at TIMESTAMP WITH TIME ZONE,
                last_export_status VARCHAR(20),
                last_export_error TEXT,
                export_count INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        # contract_data table
        op.execute("""
            CREATE TABLE IF NOT EXISTS contract_data (
                id VARCHAR(36) PRIMARY KEY,
                usage_point_id VARCHAR(14) NOT NULL UNIQUE,
                subscribed_power INTEGER,
                pricing_option VARCHAR(50),
                offpeak_hours JSONB,
                segment VARCHAR(50),
                reading_type VARCHAR(50),
                address JSONB,
                raw_data JSONB,
                last_sync_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)
        op.execute("CREATE INDEX IF NOT EXISTS ix_contract_data_usage_point_id ON contract_data(usage_point_id)")

        # address_data table
        op.execute("""
            CREATE TABLE IF NOT EXISTS address_data (
                id VARCHAR(36) PRIMARY KEY,
                usage_point_id VARCHAR(14) NOT NULL UNIQUE,
                street VARCHAR(200),
                postal_code VARCHAR(10),
                city VARCHAR(100),
                country VARCHAR(50),
                insee_code VARCHAR(10),
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                raw_data JSONB,
                last_sync_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)
        op.execute("CREATE INDEX IF NOT EXISTS ix_address_data_usage_point_id ON address_data(usage_point_id)")


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DROP TABLE IF EXISTS address_data CASCADE")
        op.execute("DROP TABLE IF EXISTS contract_data CASCADE")
        op.execute("DROP TABLE IF EXISTS export_configs CASCADE")
        op.execute("DROP TABLE IF EXISTS sync_status CASCADE")
        op.execute("DROP TABLE IF EXISTS production_data CASCADE")
        op.execute("DROP TABLE IF EXISTS consumption_data CASCADE")
        op.execute("DROP TYPE IF EXISTS exporttype")
        op.execute("DROP TYPE IF EXISTS syncstatustype")
        op.execute("DROP TYPE IF EXISTS datagranularity")

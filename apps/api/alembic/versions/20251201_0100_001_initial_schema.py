"""Initial schema baseline

Revision ID: 001
Revises:
Create Date: 2025-12-01 01:00:00

This is a baseline migration that represents the current state of the database.
It uses CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS to be idempotent.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Get the connection and check the dialect
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # PostgreSQL - use IF NOT EXISTS for idempotent migrations
        op.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(50) NOT NULL UNIQUE,
                display_name VARCHAR(100) NOT NULL,
                description VARCHAR(255),
                is_system BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS permissions (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                display_name VARCHAR(100) NOT NULL,
                description VARCHAR(255),
                resource VARCHAR(50) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS role_permissions (
                role_id VARCHAR(36) NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                permission_id VARCHAR(36) NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
                PRIMARY KEY (role_id, permission_id)
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                hashed_password VARCHAR(255) NOT NULL,
                client_id VARCHAR(64) NOT NULL UNIQUE,
                client_secret VARCHAR(128) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                is_admin BOOLEAN NOT NULL DEFAULT FALSE,
                email_verified BOOLEAN NOT NULL DEFAULT FALSE,
                debug_mode BOOLEAN NOT NULL DEFAULT FALSE,
                enedis_customer_id VARCHAR(64),
                role_id VARCHAR(36) REFERENCES roles(id),
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS pdls (
                id VARCHAR(36) PRIMARY KEY,
                usage_point_id VARCHAR(14) NOT NULL UNIQUE,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id),
                name VARCHAR(100),
                display_order INTEGER,
                subscribed_power INTEGER,
                offpeak_hours JSONB,
                pricing_option VARCHAR(50),
                has_consumption BOOLEAN NOT NULL DEFAULT TRUE,
                has_production BOOLEAN NOT NULL DEFAULT FALSE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                oldest_available_data_date DATE,
                activation_date DATE,
                linked_production_pdl_id VARCHAR(36) REFERENCES pdls(id),
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS tokens (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) REFERENCES users(id),
                usage_point_id VARCHAR(14) NOT NULL,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                token_type VARCHAR(50) NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                scope TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT uq_user_usage_point UNIQUE (user_id, usage_point_id)
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS email_verification_tokens (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS energy_providers (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                logo_url VARCHAR(512),
                website VARCHAR(512),
                scraper_urls JSONB,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS energy_offers (
                id VARCHAR(36) PRIMARY KEY,
                provider_id VARCHAR(36) NOT NULL REFERENCES energy_providers(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                offer_type VARCHAR(50) NOT NULL,
                description TEXT,
                subscription_price NUMERIC(10, 5) NOT NULL,
                base_price NUMERIC(10, 5),
                hc_price NUMERIC(10, 5),
                hp_price NUMERIC(10, 5),
                base_price_weekend NUMERIC(10, 5),
                hp_price_weekend NUMERIC(10, 5),
                hc_price_weekend NUMERIC(10, 5),
                tempo_blue_hc NUMERIC(10, 5),
                tempo_blue_hp NUMERIC(10, 5),
                tempo_white_hc NUMERIC(10, 5),
                tempo_white_hp NUMERIC(10, 5),
                tempo_red_hc NUMERIC(10, 5),
                tempo_red_hp NUMERIC(10, 5),
                ejp_normal NUMERIC(10, 5),
                ejp_peak NUMERIC(10, 5),
                hc_price_winter NUMERIC(10, 5),
                hp_price_winter NUMERIC(10, 5),
                hc_price_summer NUMERIC(10, 5),
                hp_price_summer NUMERIC(10, 5),
                peak_day_price NUMERIC(10, 5),
                hc_schedules JSONB,
                power_kva INTEGER,
                price_updated_at TIMESTAMP WITH TIME ZONE,
                valid_from TIMESTAMP WITH TIME ZONE,
                valid_to TIMESTAMP WITH TIME ZONE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS offer_contributions (
                id VARCHAR(36) PRIMARY KEY,
                contributor_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                contribution_type VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                provider_name VARCHAR(255),
                provider_website VARCHAR(512),
                existing_provider_id VARCHAR(36) REFERENCES energy_providers(id) ON DELETE SET NULL,
                existing_offer_id VARCHAR(36) REFERENCES energy_offers(id) ON DELETE SET NULL,
                offer_name VARCHAR(255) NOT NULL,
                offer_type VARCHAR(50) NOT NULL,
                description TEXT,
                pricing_data JSONB NOT NULL,
                hc_schedules JSONB,
                power_kva INTEGER,
                price_sheet_url VARCHAR(1024) NOT NULL,
                screenshot_url VARCHAR(1024),
                reviewed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
                reviewed_at TIMESTAMP WITH TIME ZONE,
                review_comment TEXT,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS tempo_days (
                id VARCHAR PRIMARY KEY,
                date TIMESTAMP WITH TIME ZONE NOT NULL UNIQUE,
                color VARCHAR(10) NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                rte_updated_date TIMESTAMP WITH TIME ZONE
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS ecowatt (
                id SERIAL PRIMARY KEY,
                generation_datetime TIMESTAMP NOT NULL,
                periode TIMESTAMP NOT NULL,
                hdebut INTEGER NOT NULL,
                hfin INTEGER NOT NULL,
                pas INTEGER DEFAULT 60,
                dvalue INTEGER NOT NULL,
                message VARCHAR,
                "values" JSONB NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                CONSTRAINT unique_ecowatt_periode UNIQUE (periode)
            )
        """)

        op.execute("""
            CREATE TABLE IF NOT EXISTS refresh_tracker (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cache_type VARCHAR NOT NULL UNIQUE,
                last_refresh TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        # Create indexes if they don't exist
        op.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users(email)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_users_client_id ON users(client_id)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_users_enedis_customer_id ON users(enedis_customer_id)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_pdls_usage_point_id ON pdls(usage_point_id)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_tokens_usage_point_id ON tokens(usage_point_id)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_roles_name ON roles(name)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_permissions_name ON permissions(name)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_email_verification_tokens_token ON email_verification_tokens(token)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token ON password_reset_tokens(token)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_tempo_days_date ON tempo_days(date)")
        op.execute("CREATE INDEX IF NOT EXISTS idx_ecowatt_periode ON ecowatt(periode)")
        op.execute("CREATE INDEX IF NOT EXISTS ix_refresh_tracker_cache_type ON refresh_tracker(cache_type)")

    else:
        # SQLite - tables are created via Base.metadata.create_all
        # This is kept for reference
        pass


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        op.execute("DROP TABLE IF EXISTS refresh_tracker CASCADE")
        op.execute("DROP TABLE IF EXISTS ecowatt CASCADE")
        op.execute("DROP TABLE IF EXISTS tempo_days CASCADE")
        op.execute("DROP TABLE IF EXISTS offer_contributions CASCADE")
        op.execute("DROP TABLE IF EXISTS energy_offers CASCADE")
        op.execute("DROP TABLE IF EXISTS energy_providers CASCADE")
        op.execute("DROP TABLE IF EXISTS password_reset_tokens CASCADE")
        op.execute("DROP TABLE IF EXISTS email_verification_tokens CASCADE")
        op.execute("DROP TABLE IF EXISTS tokens CASCADE")
        op.execute("DROP TABLE IF EXISTS pdls CASCADE")
        op.execute("DROP TABLE IF EXISTS users CASCADE")
        op.execute("DROP TABLE IF EXISTS role_permissions CASCADE")
        op.execute("DROP TABLE IF EXISTS permissions CASCADE")
        op.execute("DROP TABLE IF EXISTS roles CASCADE")

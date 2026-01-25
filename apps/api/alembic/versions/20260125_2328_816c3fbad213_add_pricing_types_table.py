"""add_pricing_types_table

Revision ID: 816c3fbad213
Revises: 8bd437e7efe0
Create Date: 2026-01-25 23:28:30.329702

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "816c3fbad213"
down_revision: Union[str, None] = "8bd437e7efe0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Créer la table pricing_types (si elle n'existe pas déjà)
    # Note: La table peut déjà exister si créée par init_db (Base.metadata.create_all)
    connection = op.get_bind()
    result = connection.execute(
        sa.text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pricing_types')")
    )
    table_exists = result.scalar()

    if not table_exists:
        op.create_table(
            "pricing_types",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("code", sa.String(length=50), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("required_price_fields", sa.JSON(), nullable=False),
            sa.Column("optional_price_fields", sa.JSON(), nullable=True),
            sa.Column("icon", sa.String(length=50), nullable=True),
            sa.Column("color", sa.String(length=20), nullable=True),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code"),
        )

    # Vérifier si la colonne pricing_type_id existe déjà
    result = connection.execute(
        sa.text("""
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'energy_offers' AND column_name = 'pricing_type_id'
            )
        """)
    )
    column_exists = result.scalar()

    if not column_exists:
        # Ajouter la colonne pricing_type_id à energy_offers
        op.add_column(
            "energy_offers",
            sa.Column("pricing_type_id", sa.String(length=36), nullable=True),
        )
        op.create_foreign_key(
            "fk_energy_offers_pricing_type_id",
            "energy_offers",
            "pricing_types",
            ["pricing_type_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Lier les offres existantes aux PricingTypes basé sur offer_type
    connection.execute(
        sa.text("""
            UPDATE energy_offers eo
            SET pricing_type_id = pt.id
            FROM pricing_types pt
            WHERE eo.offer_type = pt.code
            AND eo.pricing_type_id IS NULL
        """)
    )


def downgrade() -> None:
    # Supprimer la FK et la colonne de energy_offers
    op.drop_constraint(
        "fk_energy_offers_pricing_type_id", "energy_offers", type_="foreignkey"
    )
    op.drop_column("energy_offers", "pricing_type_id")

    # Supprimer la table pricing_types
    op.drop_table("pricing_types")

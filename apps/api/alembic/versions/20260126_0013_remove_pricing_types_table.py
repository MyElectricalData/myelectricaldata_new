"""remove_pricing_types_table

Supprime la table pricing_types et la colonne pricing_type_id de energy_offers.
Les types d'offres sont maintenant gérés via OfferRegistry (auto-discovery Python).

Revision ID: a1b2c3d4e5f6
Revises: 816c3fbad213
Create Date: 2026-01-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '816c3fbad213'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Supprime la table pricing_types et la colonne pricing_type_id.
    Les types d'offres sont maintenant définis dans les calculateurs Python
    et auto-découverts via OfferRegistry.
    """
    # Détection du type de base de données
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # PostgreSQL: supprimer la contrainte FK d'abord
        # Vérifier si la contrainte existe
        result = bind.execute(
            sa.text("""
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_energy_offers_pricing_type_id'
                AND table_name = 'energy_offers'
            """)
        )
        if result.fetchone():
            op.drop_constraint(
                "fk_energy_offers_pricing_type_id", "energy_offers", type_="foreignkey"
            )

        # Vérifier si la colonne existe avant de la supprimer
        result = bind.execute(
            sa.text("""
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'energy_offers' AND column_name = 'pricing_type_id'
            """)
        )
        if result.fetchone():
            op.drop_column("energy_offers", "pricing_type_id")

        # Vérifier si la table existe avant de la supprimer
        result = bind.execute(
            sa.text("""
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'pricing_types'
            """)
        )
        if result.fetchone():
            op.drop_table("pricing_types")

    elif dialect == "sqlite":
        # SQLite: vérifications différentes
        # Vérifier si la colonne existe
        result = bind.execute(sa.text("PRAGMA table_info(energy_offers)"))
        columns = [row[1] for row in result.fetchall()]

        if "pricing_type_id" in columns:
            # SQLite ne supporte pas DROP COLUMN facilement,
            # utiliser batch_alter_table
            with op.batch_alter_table("energy_offers") as batch_op:
                batch_op.drop_column("pricing_type_id")

        # Vérifier si la table existe
        result = bind.execute(
            sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name='pricing_types'")
        )
        if result.fetchone():
            op.drop_table("pricing_types")


def downgrade() -> None:
    """
    Recrée la table pricing_types et la colonne pricing_type_id.
    NOTE: Les données seront perdues lors du downgrade.
    """
    bind = op.get_bind()
    dialect = bind.dialect.name

    # Recréer la table pricing_types
    op.create_table(
        "pricing_types",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("required_price_fields", sa.JSON, nullable=False),
        sa.Column("optional_price_fields", sa.JSON, nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("display_order", sa.Integer, default=0, nullable=False),
        sa.Column("is_active", sa.Boolean, default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Ajouter la colonne pricing_type_id à energy_offers
    if dialect == "sqlite":
        with op.batch_alter_table("energy_offers") as batch_op:
            batch_op.add_column(
                sa.Column("pricing_type_id", sa.String(36), nullable=True)
            )
    else:
        op.add_column(
            "energy_offers",
            sa.Column("pricing_type_id", sa.String(36), nullable=True),
        )
        op.create_foreign_key(
            "fk_energy_offers_pricing_type_id",
            "energy_offers",
            "pricing_types",
            ["pricing_type_id"],
            ["id"],
            ondelete="SET NULL",
        )

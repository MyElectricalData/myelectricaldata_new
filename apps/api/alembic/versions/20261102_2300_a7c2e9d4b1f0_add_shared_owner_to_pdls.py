"""Add shared_owner_id / shared_owner_email to pdls (PDL partagés en mode client, MED-112)

Revision ID: a7c2e9d4b1f0
Revises: f4a9c1d7b3e5
Create Date: 2026-11-02 23:00:00

Colonnes nullables, sans clé étrangère (le propriétaire est un utilisateur de la passerelle,
absent de la base du client) : inoffensives sur la base de la passerelle, qui joue aussi
cette migration. Idempotente : une base SQLite neuve est amorcée par create_all puis stamp.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "a7c2e9d4b1f0"
down_revision: Union[str, None] = "f4a9c1d7b3e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX = "ix_pdls_shared_owner_id"


def _columns() -> set[str]:
    return {c["name"] for c in inspect(op.get_bind()).get_columns("pdls")}


def _indexes() -> set[str]:
    return {i["name"] for i in inspect(op.get_bind()).get_indexes("pdls")}


def upgrade() -> None:
    columns = _columns()
    if "shared_owner_id" not in columns:
        op.add_column("pdls", sa.Column("shared_owner_id", sa.String(length=36), nullable=True))
    if "shared_owner_email" not in columns:
        op.add_column("pdls", sa.Column("shared_owner_email", sa.String(length=255), nullable=True))
    if INDEX not in _indexes():
        op.create_index(INDEX, "pdls", ["shared_owner_id"], unique=False)


def downgrade() -> None:
    if INDEX in _indexes():
        op.drop_index(INDEX, table_name="pdls")
    columns = _columns()
    # batch : SQLite recrée la table au besoin pour retirer une colonne
    with op.batch_alter_table("pdls") as batch:
        if "shared_owner_email" in columns:
            batch.drop_column("shared_owner_email")
        if "shared_owner_id" in columns:
            batch.drop_column("shared_owner_id")

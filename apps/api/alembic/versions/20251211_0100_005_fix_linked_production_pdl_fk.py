"""Fix linked_production_pdl_id foreign key to SET NULL on delete

Revision ID: 005
Revises: 004
Create Date: 2025-12-11 01:00:00

Fixes IntegrityError when deleting a PDL that is referenced by another PDL
via linked_production_pdl_id. The FK constraint now uses ON DELETE SET NULL
so that deleting a production PDL automatically nullifies the reference
in any consumption PDL that was linked to it.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # PostgreSQL - drop and recreate the FK constraint with ON DELETE SET NULL
        op.execute("""
            ALTER TABLE pdls
            DROP CONSTRAINT IF EXISTS pdls_linked_production_pdl_id_fkey
        """)
        op.execute("""
            ALTER TABLE pdls
            ADD CONSTRAINT pdls_linked_production_pdl_id_fkey
            FOREIGN KEY (linked_production_pdl_id) REFERENCES pdls(id)
            ON DELETE SET NULL
        """)
    else:
        # SQLite doesn't support ALTER CONSTRAINT, but it also doesn't
        # enforce foreign keys by default, so this is a no-op for SQLite.
        # If you need strict FK enforcement in SQLite, you'd need to
        # recreate the table entirely.
        pass


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "postgresql":
        # Restore the original FK constraint without ON DELETE behavior
        op.execute("""
            ALTER TABLE pdls
            DROP CONSTRAINT IF EXISTS pdls_linked_production_pdl_id_fkey
        """)
        op.execute("""
            ALTER TABLE pdls
            ADD CONSTRAINT pdls_linked_production_pdl_id_fkey
            FOREIGN KEY (linked_production_pdl_id) REFERENCES pdls(id)
        """)
    else:
        pass

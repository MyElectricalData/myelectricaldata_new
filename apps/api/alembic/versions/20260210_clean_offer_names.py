"""Nettoyer les noms d'offres : retirer le type et la puissance du champ name

Le champ name contenait le type d'offre et la puissance (ex: "Tarif Bleu - TEMPO 9 kVA")
alors que ces informations sont déjà dans offer_type et power_kva.
Cette migration renomme les offres pour ne garder que le nom commercial,
puis déduplique les offres actives qui se retrouvent avec le même triplet
(name, offer_type, power_kva).

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-10

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Renommer les offres EDF seed/scraper
    op.execute("""
        UPDATE energy_offers
        SET name = 'Tarif Bleu'
        WHERE name LIKE 'Tarif Bleu - BASE %'
           OR name LIKE 'Tarif Bleu - HC/HP %'
           OR name LIKE 'Tarif Bleu - TEMPO %'
           OR name LIKE 'Tarif Bleu - Base %'
           OR name LIKE 'Tarif Bleu - Heures Creuses %'
           OR name LIKE 'Tarif Bleu - Tempo %'
    """)

    # 2. Renommer les offres Tempo contribuées
    op.execute("""
        UPDATE energy_offers
        SET name = 'Tempo'
        WHERE name LIKE 'Tempo - % kVA'
    """)

    # 3. Dédupliquer les offres actives ayant le même (name, offer_type, power_kva, provider_id)
    # On garde l'offre avec le valid_from le plus récent (ou la plus récemment créée si pas de valid_from)
    # Les doublons sont désactivés (is_active = false)
    op.execute("""
        UPDATE energy_offers
        SET is_active = false
        WHERE id IN (
            SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY name, offer_type, power_kva, provider_id
                           ORDER BY valid_from DESC NULLS LAST, created_at DESC
                       ) as rn
                FROM energy_offers
                WHERE is_active = true
            ) ranked
            WHERE rn > 1
        )
    """)


def downgrade() -> None:
    # Pas de rollback possible car l'information de type/puissance
    # est toujours disponible via offer_type et power_kva
    pass

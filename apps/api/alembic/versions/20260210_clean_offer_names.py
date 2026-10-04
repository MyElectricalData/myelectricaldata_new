"""Nettoyer les noms d'offres : retirer le type et la puissance du champ name

Le champ name contenait le type d'offre et la puissance (ex: "Tarif Bleu - BASE 9 kVA",
"Zen Fixe - Option Base - 3 kVA") alors que ces informations sont déjà dans offer_type
et power_kva. Cette migration nettoie TOUS les patterns en deux passes :
  1. Retirer le suffixe "- XX kVA" (avec ou sans type/option devant)
  2. Retirer les suffixes de type restants ("- BASE", "- Option Base", etc.)
Puis déduplique les offres actives ayant le même triplet (name, offer_type, power_kva).

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
    # Passe 1 : retirer "- Option XXX - XX kVA" (forme longue avec Option)
    # Note : les "+" doivent être échappés en "\\+" car ce sont des métacaractères regex
    option_patterns = [
        ("Option Base", "Option Base"),
        ("Option Heures Creuses \\+ WE \\+ jour choisi", "Option Heures Creuses \\+ WE \\+ jour choisi"),
        ("Option Heures Creuses \\+ WE", "Option Heures Creuses \\+ WE"),
        ("Option Heures Creuses", "Option Heures Creuses"),
        ("Option WE \\+ jour choisi", "Option WE \\+ jour choisi"),
        ("Option Week-End", "Option Week-End"),
        ("Option Flex", "Option Flex"),
    ]
    for _, pattern in option_patterns:
        # "Zen Fixe - Option Base - 3 kVA" → "Zen Fixe"
        op.execute(f"""
            UPDATE energy_offers
            SET name = TRIM(REGEXP_REPLACE(name, '\\s*-\\s*{pattern}\\s*-\\s*\\d+\\s*kVA\\s*$', '', 'i'))
            WHERE name ~* '.*-\\s*{pattern}\\s*-\\s*\\d+\\s*kVA\\s*$'
        """)

    # Passe 2 : retirer "- TYPE XX kVA" (forme avec type code dans le nom)
    type_codes = ["BASE", "HC/HP", "HC_HP", "TEMPO", "EJP", "SEASONAL",
                  "BASE_WEEKEND", "HC_WEEKEND", "HC_NUIT_WEEKEND", "ZEN_FLEX"]
    for tc in type_codes:
        # "Tarif Bleu - BASE 36 kVA" → "Tarif Bleu"
        op.execute(f"""
            UPDATE energy_offers
            SET name = TRIM(REGEXP_REPLACE(name, '\\s*-\\s*{tc}\\s+\\d+\\s*kVA\\s*$', '', 'i'))
            WHERE name ~* '.*-\\s*{tc}\\s+\\d+\\s*kVA\\s*$'
        """)

    # Passe 3 : retirer "- XX kVA" simple (reste)
    # "Classique - 10 kVA" → "Classique"
    op.execute("""
        UPDATE energy_offers
        SET name = TRIM(REGEXP_REPLACE(name, '\\s*-\\s*\\d+\\s*kVA\\s*$', '', 'i'))
        WHERE name ~* '.*-\\s*\\d+\\s*kVA\\s*$'
    """)

    # Passe 4 : retirer les suffixes de type restants (sans kVA)
    # "Tarif Bleu - HC/HP" → "Tarif Bleu"
    for tc in type_codes:
        op.execute(f"""
            UPDATE energy_offers
            SET name = TRIM(REGEXP_REPLACE(name, '\\s*-\\s*{tc}\\s*$', '', 'i'))
            WHERE name ~* '.*-\\s*{tc}\\s*$'
        """)

    # Passe 5 : retirer les suffixes "- Option XXX" restants (sans kVA)
    for _, pattern in option_patterns:
        op.execute(f"""
            UPDATE energy_offers
            SET name = TRIM(REGEXP_REPLACE(name, '\\s*-\\s*{pattern}\\s*$', '', 'i'))
            WHERE name ~* '.*-\\s*{pattern}\\s*$'
        """)

    # Passe 6 : dédupliquer les offres actives ayant le même (name, offer_type, power_kva, provider_id)
    # On garde l'offre avec le valid_from le plus récent
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

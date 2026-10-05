"""Nettoyer tous les noms d'offres : ne garder que le nom commercial

b2c3d4e5f6g7 ne traitait que "Tarif Bleu" et "Tempo" : les autres offres gardaient la
puissance et l'option dans leur nom (ex: "Classique - 6 kVA", "Zen Fixe - Option Base - 6 kVA")
alors que ces informations sont déjà dans power_kva et offer_type. Cette migration :
  1. retire la puissance en fin de nom ("- 6 kVA", " 6 kVA"), après l'avoir recopiée dans
     power_kva quand celui-ci est vide ;
  2. retire une clé de groupe du front ("Tarif Bleu##2026-02-06##active", envoyée par erreur comme nom),
     puis le suffixe de type ou d'option restant ("- BASE", "- Option Heures Creuses + WE"...) ;
  3. désactive les offres COURANTES devenues doublons (même provider, name, offer_type, power_kva), après
     avoir fait pointer vers l'offre gardée les PDL et les contributions en attente qui les citent.

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-10-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6g7h8'
down_revision: Union[str, None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Puissance en fin de nom, avec ou sans tiret : "Classique - 6 kVA", "Tarif Bleu - BASE 6 kVA"
POWER_SUFFIX = r'\s*-?\s*\d+\s*kVA\s*$'

# Clé de groupe du front ("nom##période") envoyée par erreur comme nom d'offre (2 offres en prod)
GROUP_KEY_SUFFIX = r'\s*##.*$'

# Types et options qui doublonnent offer_type, du plus long au plus court.
# "Option Flex" n'en fait pas partie : l'export Home Assistant (MED-21) reconnaît Zen Flex servie
# en SEASONAL à ce nom, y compris chez les clients déjà déployés.
TYPE_SUFFIXES = [
    r'Option Heures Creuses \+ WE \+ jour choisi',
    r'Option Heures Creuses \+ WE',
    r'Option Heures Creuses',
    r'Option WE \+ jour choisi',
    r'Option Week-End',
    r'Option Base',
    r'HC/HP \+ WE',
    r'BASE_WEEKEND',
    r'HC_NUIT_WEEKEND',
    r'HC_WEEKEND',
    r'ZEN_FLEX',
    r'SEASONAL',
    r'HC/HP',
    r'HC_HP',
    r'TEMPO',
    r'BASE',
    r'EJP',
]
TYPE_SUFFIX = r'\s*-\s*(' + '|'.join(TYPE_SUFFIXES) + r')\s*$'


# Puissance à recopier dans power_kva (insensible à la casse : "6 kVA", "6 KVA")
POWER_VALUE = r'(?i)(\d+)\s*kVA\s*$'

# Offre courante : active et sans fin, ou fin à venir. L'historique reste is_active avec un
# valid_to (deactivate_previous_offers) : il ne doit ni être dédoublonné ni évincer l'offre courante.
CURRENT_OFFER = "is_active AND (valid_to IS NULL OR valid_to > now())"


def _strip_suffix(pattern: str) -> None:
    # Regex passée en paramètre : pas d'échappement SQL à gérer, et "~*" = insensible à la casse.
    # Un nom qui ne serait plus qu'un suffixe est laissé tel quel (comme clean_offer_name).
    op.get_bind().execute(
        sa.text("""
            UPDATE energy_offers
            SET name = btrim(regexp_replace(name, :pattern, '', 'i'))
            WHERE name ~* :pattern AND btrim(regexp_replace(name, :pattern, '', 'i')) <> ''
        """),
        {"pattern": pattern},
    )


def upgrade() -> None:
    # Une offre sans power_kva n'a sa puissance que dans le nom : la recopier avant de la retirer
    op.get_bind().execute(
        sa.text("""
            UPDATE energy_offers
            SET power_kva = substring(name from :power_value)::integer
            WHERE power_kva IS NULL AND name ~* :pattern
        """),
        {"pattern": POWER_SUFFIX, "power_value": POWER_VALUE},
    )
    _strip_suffix(POWER_SUFFIX)
    _strip_suffix(GROUP_KEY_SUFFIX)
    _strip_suffix(TYPE_SUFFIX)

    # Doublons courants : on garde l'offre au valid_from le plus récent, les autres sont désactivées
    # après avoir fait pointer vers l'offre gardée les PDL et les contributions en attente qui les citent
    op.execute(f"""
        CREATE TEMP TABLE offer_duplicates AS
        SELECT id AS duplicate_id, kept_id FROM (
            SELECT id,
                   first_value(id) OVER w AS kept_id,
                   row_number() OVER w AS rn
            FROM energy_offers
            WHERE {CURRENT_OFFER}
            WINDOW w AS (
                PARTITION BY provider_id, name, offer_type, power_kva
                ORDER BY valid_from DESC NULLS LAST, created_at DESC
            )
        ) ranked
        WHERE rn > 1
    """)
    op.execute("""
        UPDATE pdls SET selected_offer_id = d.kept_id
        FROM offer_duplicates d WHERE pdls.selected_offer_id = d.duplicate_id
    """)
    op.execute("""
        UPDATE offer_contributions SET existing_offer_id = d.kept_id
        FROM offer_duplicates d
        WHERE offer_contributions.existing_offer_id = d.duplicate_id AND offer_contributions.status = 'pending'
    """)
    op.execute("UPDATE energy_offers SET is_active = false WHERE id IN (SELECT duplicate_id FROM offer_duplicates)")
    op.execute("DROP TABLE offer_duplicates")


def downgrade() -> None:
    # Pas de rollback : la puissance et l'option restent dans power_kva et offer_type
    pass

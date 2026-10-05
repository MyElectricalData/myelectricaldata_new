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

Portable : elle tourne sur le serveur (PostgreSQL) et sur les clients locaux (SQLite par défaut).
Les noms sont calculés en Python et écrits par des UPDATE paramétrés, sans fonction propre à un
dialecte (pas de ~*, regexp_replace ni ::integer).

Revision ID: f4a9c1d7b3e5
Revises: e7f1a2b3c4d5
Create Date: 2026-10-05

"""
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f4a9c1d7b3e5'
down_revision: Union[str, None] = 'e7f1a2b3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Mêmes règles que src/services/offer_names.py, recopiées ici : une migration ne doit pas
# dépendre du code applicatif.

# Puissance en fin de nom, avec ou sans tiret : "Classique - 6 kVA", "Tarif Bleu - BASE 6 kVA"
POWER_SUFFIX = re.compile(r'\s*-?\s*(\d+)\s*kVA\s*$', re.IGNORECASE)

# Clé de groupe du front ("nom##période") envoyée par erreur comme nom d'offre (2 offres en prod)
GROUP_KEY_SUFFIX = re.compile(r'\s*##.*$')

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
TYPE_SUFFIX = re.compile(r'\s*-\s*(' + '|'.join(TYPE_SUFFIXES) + r')\s*$', re.IGNORECASE)


def _clean_name(name: str) -> str:
    if not name or name.startswith("["):
        return name
    for pattern in (POWER_SUFFIX, GROUP_KEY_SUFFIX, TYPE_SUFFIX):
        # un nom qui ne serait plus qu'un suffixe est laissé tel quel
        name = pattern.sub("", name).strip() or name
    return name


def _as_utc(value):
    """Date lue en base : datetime (PostgreSQL) ou texte ISO (SQLite), naïve = UTC."""
    if value is None:
        return None
    if isinstance(value, str):
        value = datetime.fromisoformat(value.strip().replace(" ", "T", 1))
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def upgrade() -> None:
    bind = op.get_bind()

    # 1-2. Noms et puissance (recopiée du nom quand power_kva est vide)
    updates = []
    for offer_id, name, power_kva in bind.execute(sa.text("SELECT id, name, power_kva FROM energy_offers")):
        new_power = power_kva
        if power_kva is None and name and (match := POWER_SUFFIX.search(name)):
            new_power = int(match.group(1))
        new_name = _clean_name(name)
        if new_name != name or new_power != power_kva:
            updates.append({"id": offer_id, "name": new_name, "power_kva": new_power})
    if updates:
        bind.execute(sa.text("UPDATE energy_offers SET name = :name, power_kva = :power_kva WHERE id = :id"), updates)

    # 3. Doublons COURANTS : l'historique reste is_active avec un valid_to (deactivate_previous_offers),
    # il ne doit ni être dédoublonné ni évincer l'offre courante
    now = datetime.now(timezone.utc)
    groups = defaultdict(list)
    rows = bind.execute(
        sa.text(
            "SELECT id, provider_id, name, offer_type, power_kva, valid_from, valid_to, created_at "
            "FROM energy_offers WHERE is_active = :active"
        ),
        {"active": True},
    )
    for row in rows:
        valid_to = _as_utc(row.valid_to)
        if valid_to is None or valid_to > now:
            groups[(row.provider_id, row.name, row.offer_type, row.power_kva)].append(row)

    oldest = datetime.min.replace(tzinfo=timezone.utc)
    pairs = []
    for offers in groups.values():
        if len(offers) < 2:
            continue
        # on garde l'offre au valid_from le plus récent (les offres sans valid_from en dernier)
        offers.sort(
            key=lambda o: (o.valid_from is not None, _as_utc(o.valid_from) or oldest, _as_utc(o.created_at) or oldest),
            reverse=True,
        )
        pairs += [{"duplicate_id": o.id, "kept_id": offers[0].id} for o in offers[1:]]
    if not pairs:
        return

    # les PDL et les contributions en attente qui citent un doublon suivent l'offre gardée
    tables = sa.inspect(bind).get_table_names()
    if "pdls" in tables:
        bind.execute(
            sa.text("UPDATE pdls SET selected_offer_id = :kept_id WHERE selected_offer_id = :duplicate_id"), pairs
        )
    if "offer_contributions" in tables:
        bind.execute(
            sa.text(
                "UPDATE offer_contributions SET existing_offer_id = :kept_id "
                "WHERE existing_offer_id = :duplicate_id AND status = 'pending'"
            ),
            pairs,
        )
    bind.execute(
        sa.text("UPDATE energy_offers SET is_active = :active WHERE id = :duplicate_id"),
        [{"duplicate_id": p["duplicate_id"], "active": False} for p in pairs],
    )


def downgrade() -> None:
    # Pas de rollback : la puissance et l'option restent dans power_kva et offer_type
    pass

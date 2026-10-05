"""Nom canonique d'une offre : le nom commercial seul (MED-22).

La puissance est portée par `power_kva` et l'option par `offer_type` : on les retire du nom
pour qu'une même offre n'existe pas sous plusieurs noms ("Tarif Bleu" et "Tarif Bleu - 9 kVA").

Mêmes règles que la migration `f4a9c1d7b3e5` (alembic/versions/20261005_clean_offer_names_v2.py),
qui garde sa propre copie : une migration ne doit pas dépendre du code applicatif.
"""
import re

# Puissance en fin de nom, avec ou sans tiret : "Classique - 6 kVA", "Tarif Bleu - BASE 6 kVA"
POWER_SUFFIX = re.compile(r'\s*-?\s*\d+\s*kVA\s*$', re.IGNORECASE)

# Clé de groupe du front ("nom##période") envoyée par erreur comme nom d'offre
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


def clean_offer_name(name: str | None) -> str | None:
    """Retire la puissance, une clé de groupe du front ("##période"), puis le type ou l'option en fin de nom.

    Les marqueurs de contribution ("[SUPPRESSION] ...", "[RENOMMAGE] ...") sont laissés tels
    quels : ce ne sont pas des noms d'offre et leur contenu est relu ailleurs.
    """
    if not name or name.startswith("["):
        return name
    for pattern in (POWER_SUFFIX, GROUP_KEY_SUFFIX, TYPE_SUFFIX):
        # un nom qui ne serait plus qu'un suffixe est laissé tel quel (comme la migration)
        name = pattern.sub("", name).strip() or name
    return name

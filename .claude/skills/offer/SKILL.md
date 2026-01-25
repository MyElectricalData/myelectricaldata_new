---
name: offer
description: Ajout d'un nouveau fournisseur d'énergie
argument-hint: "<CODE> [--new|-n] [--delete|-d] [--bug|-b] [--list|-l] [--info|-i]"
auto_continue: true
allowed_tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash
  - Task
  - AskUserQuestion
file_patterns:
  - "apps/api/src/services/offers/**/*"
  - "apps/api/src/models/seed.py"
  - "docs/features-spec/energy-providers-scrapers.md"
---

# Skill Offer - Gestion des types d'offres tarifaires

## Description

Skill complet pour gerer les calculateurs d'offres tarifaires. Chaque type d'offre (BASE, HC_HP, TEMPO, etc.) est une classe Python qui herite de `BaseOfferCalculator` et implemente la logique de calcul specifique.

## Usage

```bash
/offer                           # Mode interactif : demande l'action
/offer --list                    # Lister les types existants
/offer <CODE> --info             # Afficher les details d'un type
/offer <CODE> --new              # Creer un nouveau type d'offre
/offer <CODE> --bug <desc>       # Corriger un bug dans un calculateur
/offer <CODE> --delete           # Supprimer un type d'offre
```

## Arguments

| Argument   | Alias | Description                                           |
| ---------- | ----- | ----------------------------------------------------- |
| `<CODE>`   |       | Code du type d'offre (ex: TEMPO, HC_HP, TRI_HORAIRE)  |
| `--list`   | `-l`  | Lister tous les types d'offres disponibles            |
| `--info`   | `-i`  | Afficher les details d'un type (tarifs, periodes)     |
| `--new`    | `-n`  | Creer un nouveau type d'offre                         |
| `--bug`    | `-b`  | Corriger un bug dans un calculateur existant          |
| `--delete` | `-d`  | Supprimer un type d'offre et ses references           |

## Modes d'execution

### Mode `--list` : Lister les types

Affiche tous les types d'offres decouverts par l'API.

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TYPES D'OFFRES DISPONIBLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
| Code             | Nom                    | Tarifs | Ordre |
| ---------------- | ---------------------- | ------ | ----- |
| BASE             | Base                   | 1      | 1     |
| HC_HP            | Heures Creuses/Pleines | 2-4    | 2     |
| TEMPO            | Tempo                  | 6      | 3     |
| EJP              | EJP                    | 2      | 4     |
| SEASONAL         | Saisonnier             | 4-5    | 5     |
| HC_NUIT_WEEKEND  | Nuit & Week-end        | 2      | 6     |
| WEEKEND          | Week-end               | 4      | 7     |
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Mode `--info` : Details d'un type

Affiche les informations detaillees d'un calculateur existant.

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DETAILS - TEMPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fichier     : apps/api/src/services/offers/tempo.py
Classe      : TempoCalculator
Description : 6 tarifs selon le jour (Bleu, Blanc, Rouge)...

Champs obligatoires :
  - tempo_blue_hc, tempo_blue_hp
  - tempo_white_hc, tempo_white_hp
  - tempo_red_hc, tempo_red_hp

Champs optionnels :
  - hc_schedules

Periodes tarifaires :
| Nom            | Code          | Couleur | Condition            |
| -------------- | ------------- | ------- | -------------------- |
| Jour Bleu HC   | tempo_blue_hc | #3B82F6 | Jour bleu, 22h-6h    |
| Jour Bleu HP   | tempo_blue_hp | #60A5FA | Jour bleu, 6h-22h    |
| ...            | ...           | ...     | ...                  |
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Mode `--new` : Creer un type

Workflow guide en 6 etapes pour creer un nouveau calculateur.

→ Voir `steps/01-explore.md` a `steps/06-validate.md`

### Mode `--bug` : Corriger un bug

Workflow pour analyser et corriger un bug dans un calculateur existant.

→ Voir `steps/bug-analyze.md` et `steps/bug-fix.md`

### Mode `--delete` : Supprimer un type

Workflow pour supprimer proprement un calculateur et ses references.

→ Voir `steps/delete.md`

## Types d'offres existants

| Code              | Nom                    | Tarifs | Fichier              |
| ----------------- | ---------------------- | ------ | -------------------- |
| `BASE`            | Base                   | 1      | `base_offer.py`      |
| `HC_HP`           | Heures Creuses/Pleines | 2-4    | `hc_hp.py`           |
| `TEMPO`           | Tempo                  | 6      | `tempo.py`           |
| `EJP`             | EJP                    | 2      | `ejp.py`             |
| `SEASONAL`        | Saisonnier (2 saisons) | 4-5    | `seasonal.py`        |
| `HC_NUIT_WEEKEND` | Nuit & Week-end        | 2      | `hc_nuit_weekend.py` |
| `WEEKEND`         | Week-end               | 4      | `weekend.py`         |

## Architecture

### Structure des fichiers

```text
apps/api/src/services/offers/
├── __init__.py         # Exports et imports
├── base.py             # Classes abstraites (BaseOfferCalculator, etc.)
├── registry.py         # Auto-discovery des calculateurs
├── base_offer.py       # Calculateur BASE
├── hc_hp.py            # Calculateur HC_HP (+ utilitaires HC)
├── tempo.py            # Calculateur TEMPO
├── ejp.py              # Calculateur EJP
├── seasonal.py         # Calculateur SEASONAL
├── hc_nuit_weekend.py  # Calculateur HC_NUIT_WEEKEND
└── weekend.py          # Calculateur WEEKEND
```

### Classe de base

```python
class BaseOfferCalculator(ABC):
    # Attributs de classe obligatoires
    code: ClassVar[str]                      # Code unique (ex: "MY_OFFER")
    name: ClassVar[str]                      # Nom affiche
    description: ClassVar[str]               # Description pour l'utilisateur
    icon: ClassVar[str]                      # Icone Lucide (ex: "zap", "clock")
    color: ClassVar[str]                     # Couleur hex (ex: "#3B82F6")
    required_price_fields: ClassVar[list]    # Champs prix obligatoires
    optional_price_fields: ClassVar[list]    # Champs prix optionnels
    display_order: ClassVar[int]             # Ordre d'affichage

    @abstractmethod
    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        pass
```

### Auto-discovery

Les calculateurs sont decouverts automatiquement via `OfferRegistry` qui utilise `__subclasses__()`. Il suffit que la classe :

1. Herite de `BaseOfferCalculator`
2. Soit importee dans `__init__.py`
3. Definisse tous les attributs de classe obligatoires

### Endpoint API

```text
GET /api/energy/offer-types

Response:
{
  "success": true,
  "data": [
    {
      "code": "BASE",
      "name": "Base",
      "description": "...",
      "icon": "zap",
      "color": "#3B82F6",
      "required_price_fields": ["base_price"],
      "optional_price_fields": ["base_price_weekend"],
      "display_order": 1
    },
    ...
  ]
}
```

## Champs de prix disponibles

### Champs standard (model EnergyOffer)

| Champ                | Type          | Description                |
| -------------------- | ------------- | -------------------------- |
| `base_price`         | Decimal(10,5) | Prix BASE                  |
| `hc_price`           | Decimal(10,5) | Prix Heures Creuses        |
| `hp_price`           | Decimal(10,5) | Prix Heures Pleines        |
| `base_price_weekend` | Decimal(10,5) | Prix BASE week-end         |
| `hc_price_weekend`   | Decimal(10,5) | Prix HC week-end           |
| `hp_price_weekend`   | Decimal(10,5) | Prix HP week-end           |
| `tempo_blue_hc`      | Decimal(10,5) | Prix Tempo Bleu HC         |
| `tempo_blue_hp`      | Decimal(10,5) | Prix Tempo Bleu HP         |
| `tempo_white_hc`     | Decimal(10,5) | Prix Tempo Blanc HC        |
| `tempo_white_hp`     | Decimal(10,5) | Prix Tempo Blanc HP        |
| `tempo_red_hc`       | Decimal(10,5) | Prix Tempo Rouge HC        |
| `tempo_red_hp`       | Decimal(10,5) | Prix Tempo Rouge HP        |
| `ejp_normal`         | Decimal(10,5) | Prix EJP Normal            |
| `ejp_peak`           | Decimal(10,5) | Prix EJP Pointe Mobile     |
| `hc_price_winter`    | Decimal(10,5) | Prix HC Hiver (saisonnier) |
| `hp_price_winter`    | Decimal(10,5) | Prix HP Hiver              |
| `hc_price_summer`    | Decimal(10,5) | Prix HC Ete                |
| `hp_price_summer`    | Decimal(10,5) | Prix HP Ete                |
| `peak_day_price`     | Decimal(10,5) | Prix Jour de Pointe        |
| `hc_schedules`       | JSON          | Horaires HC personnalises  |

### Ajouter de nouveaux champs

Si un nouveau type necessite des champs non existants :

1. Ajouter la colonne dans `apps/api/src/models/energy_provider.py`
2. Creer une migration Alembic
3. Mettre a jour les schemas Pydantic si necessaire

## Exemples

```bash
# Lister les types existants
/offer --list

# Voir les details du type TEMPO
/offer TEMPO --info

# Creer une offre Tri-Horaire
/offer TRI_HORAIRE --new

# Corriger un bug dans le calculateur SEASONAL
/offer SEASONAL --bug "Les mois d'hiver ne sont pas corrects"

# Supprimer un type d'offre
/offer OLD_TYPE --delete

# Mode interactif
/offer
```

## Workflow par mode

### Mode `--new` (6 etapes)

| Step | Fichier          | Description                                         |
| ---- | ---------------- | --------------------------------------------------- |
| 1    | 01-explore.md    | Analyser les offres existantes et definir le besoin |
| 2    | 02-plan.md       | Specifier la nouvelle offre (tarifs, horaires)      |
| 3    | 03-implement.md  | Creer la classe calculateur                         |
| 4    | 04-test.md       | Verifier avec des donnees de test                   |
| 5    | 05-seed.md       | Ajouter au seed et aux pricing_types                |
| 6    | 06-validate.md   | Validation finale et lint                           |

### Mode `--bug` (2 etapes)

| Step | Fichier         | Description                              |
| ---- | --------------- | ---------------------------------------- |
| 1    | bug-analyze.md  | Analyser le bug et identifier la cause   |
| 2    | bug-fix.md      | Corriger et valider la correction        |

### Mode `--delete` (1 etape)

| Step | Fichier   | Description                            |
| ---- | --------- | -------------------------------------- |
| 1    | delete.md | Supprimer le calculateur et references |

## References

- **Classes de base** : `apps/api/src/services/offers/base.py`
- **Registry** : `apps/api/src/services/offers/registry.py`
- **Modele EnergyOffer** : `apps/api/src/models/energy_provider.py`
- **Endpoint API** : `apps/api/src/routers/energy_offers.py`
- **Seed** : `apps/api/src/models/seed.py`

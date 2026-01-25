---
name: 03-implement
description: Creer la classe calculateur
prev_step: steps/02-plan.md
next_step: steps/04-test.md
---

# Step 3/6 : Implementer le calculateur

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 STEP 3/6 - IMPLEMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Creer le fichier calculateur

### 1.1 Nom du fichier

Convertir le code en nom de fichier snake_case :

| Code        | Fichier          |
| ----------- | ---------------- |
| TRI_HORAIRE | `tri_horaire.py` |
| DYNAMIC     | `dynamic.py`     |
| SUPER_HC    | `super_hc.py`    |

### 1.2 Template de base

Creer le fichier `apps/api/src/services/offers/<nom_fichier>.py` :

```python
"""
Calculateur pour l'offre tarifaire <CODE>.

<Description complete de l'offre avec les periodes tarifaires>

Exemple : <Fournisseur> <Nom Offre>.
"""

from decimal import Decimal
from typing import ClassVar

from .base import (
    BaseOfferCalculator,
    ConsumptionData,
    CalculationResult,
    PeriodDetail,
)


class <NomClasse>Calculator(BaseOfferCalculator):
    """Calculateur pour l'offre <nom>."""

    code: ClassVar[str] = "<CODE>"
    name: ClassVar[str] = "<nom>"
    description: ClassVar[str] = "<description>"
    icon: ClassVar[str] = "<icone>"
    color: ClassVar[str] = "<couleur>"

    required_price_fields: ClassVar[list[str]] = [<champs_obligatoires>]
    optional_price_fields: ClassVar[list[str]] = [<champs_optionnels>]

    display_order: ClassVar[int] = <ordre>

    def calculate(
        self,
        consumption: ConsumptionData,
        prices: dict[str, Decimal],
        subscription_monthly: Decimal,
        hc_schedules: dict[str, str] | None = None,
    ) -> CalculationResult:
        """
        Calcule le cout avec tarification <nom>.

        Args:
            consumption: Donnees de consommation
            prices: Dictionnaire des prix
            subscription_monthly: Abonnement mensuel
            hc_schedules: Horaires HC personnalises (si applicable)
        """
        # 1. Recuperer les prix
        # 2. Initialiser les accumulateurs par periode
        # 3. Boucler sur les points de consommation
        # 4. Determiner la periode pour chaque point
        # 5. Accumuler kwh et cout
        # 6. Calculer les totaux
        # 7. Construire les PeriodDetail
        # 8. Retourner CalculationResult
        pass
```

## Etape 2 : Implementer la logique de calcul

### 2.1 Recuperer les prix

```python
# Exemple pour 3 tarifs
hc_price = Decimal(str(prices.get("hc_price", 0)))
hn_price = Decimal(str(prices.get("hn_price", 0)))
hp_price = Decimal(str(prices.get("hp_price", 0)))
```

### 2.2 Initialiser les accumulateurs

```python
# Structure simple
hc_kwh = Decimal(0)
hc_cost = Decimal(0)
# ...

# Ou structure avec dictionnaire
totals = {
    "hc": {"kwh": Decimal(0), "cost": Decimal(0), "price": hc_price},
    "hn": {"kwh": Decimal(0), "cost": Decimal(0), "price": hn_price},
    "hp": {"kwh": Decimal(0), "cost": Decimal(0), "price": hp_price},
}
```

### 2.3 Boucler et classifier

```python
for point in consumption.points:
    hour = point.timestamp.hour
    weekday = point.timestamp.weekday()  # 0=lundi, 6=dimanche
    month = point.timestamp.month
    kwh = point.value_kwh

    # Determiner la periode (logique specifique a l'offre)
    if <condition_hc>:
        period_key = "hc"
    elif <condition_hn>:
        period_key = "hn"
    else:
        period_key = "hp"

    # Accumuler
    totals[period_key]["kwh"] += kwh
    totals[period_key]["cost"] += kwh * totals[period_key]["price"]
```

### 2.4 Calculer les totaux

```python
total_kwh = sum(t["kwh"] for t in totals.values())
total_cost = sum(t["cost"] for t in totals.values())
subscription_cost = self._calculate_subscription(
    consumption.days_count, subscription_monthly
)
```

### 2.5 Construire les periodes

```python
periods = []

period_configs = [
    ("hc", "Heures Creuses", "#10B981"),
    ("hn", "Heures Normales", "#FBBF24"),
    ("hp", "Heures Pleines", "#F59E0B"),
]

for key, name, color in period_configs:
    data = totals[key]
    if data["kwh"] > 0:
        periods.append(
            PeriodDetail(
                name=name,
                code=key,
                consumption_kwh=data["kwh"],
                unit_price=data["price"],
                cost_euros=data["cost"],
                color=color,
                percentage=self._calculate_period_percentage(data["kwh"], total_kwh),
            )
        )
```

### 2.6 Retourner le resultat

```python
return CalculationResult(
    total_kwh=total_kwh,
    total_cost_euros=total_cost,
    subscription_cost_euros=subscription_cost,
    total_with_subscription=total_cost + subscription_cost,
    periods=periods,
    offer_type=self.code,
    offer_name=self.name,
    days_count=consumption.days_count,
)
```

## Etape 3 : Ajouter a **init**.py

Editer `apps/api/src/services/offers/__init__.py` :

```python
# Ajouter l'import
from .<nom_fichier> import <NomClasse>Calculator

# Ajouter dans __all__
__all__ = [
    # ...
    "<NomClasse>Calculator",
    # ...
]
```

## Etape 4 : Ajouter les champs de prix (si necessaire)

Si de nouveaux champs de prix sont requis :

### 4.1 Modifier le modele

Editer `apps/api/src/models/energy_provider.py`, classe `EnergyOffer` :

```python
# Ajouter les nouveaux champs
tri_heure_hn: Mapped[Decimal | None] = mapped_column(Numeric(10, 5), nullable=True)
```

### 4.2 Creer la migration

```bash
docker compose -f dev/docker-compose.server.yml exec backend alembic revision --autogenerate -m "add_<code>_price_fields"
```

### 4.3 Appliquer la migration

```bash
docker compose -f dev/docker-compose.server.yml exec backend alembic upgrade head
```

## Recap Step 3

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ STEP 3/6 - IMPLEMENTATION TERMINEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fichier cree    : apps/api/src/services/offers/<nom>.py
Export ajoute   : __init__.py mis a jour
Migration       : [Oui: <nom_migration> / Non necessaire]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage au Step 4 : Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

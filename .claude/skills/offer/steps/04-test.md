---
name: 04-test
description: Tester le calculateur avec des donnees de test
prev_step: steps/03-implement.md
next_step: steps/05-seed.md
---

# Step 4/6 : Tester le calculateur

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 STEP 4/6 - TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Verifier l'auto-discovery

Redemarrer le backend pour prendre en compte le nouveau calculateur :

```bash
docker compose -f dev/docker-compose.server.yml restart backend
```

Attendre quelques secondes puis verifier que le type apparait :

```bash
curl -s http://localhost:8081/api/energy/offer-types | python3 -m json.tool | grep -A 10 '"code": "<CODE>"'
```

**Resultat attendu** : Le nouveau type doit apparaitre dans la liste avec tous ses attributs.

## Etape 2 : Test unitaire rapide

Creer un script de test dans le scratchpad :

```python
# /private/tmp/claude/.../scratchpad/test_<code>.py
"""Test rapide du calculateur <CODE>."""

from datetime import datetime, date
from decimal import Decimal
import sys
sys.path.insert(0, '/app/src')

from services.offers import get_calculator, ConsumptionData
from services.offers.base import ConsumptionPoint

# Creer des donnees de test
points = []
# Ajouter des points a differentes heures pour couvrir toutes les periodes
for hour in range(24):
    points.append(ConsumptionPoint(
        timestamp=datetime(2024, 1, 15, hour, 0),  # Lundi
        value_wh=1000,  # 1 kWh
    ))

consumption = ConsumptionData(
    points=points,
    start_date=date(2024, 1, 15),
    end_date=date(2024, 1, 15),
)

# Prix de test
prices = {
    "<champ1>": Decimal("0.10"),
    "<champ2>": Decimal("0.15"),
    "<champ3>": Decimal("0.20"),
}

# Calculer
calculator = get_calculator("<CODE>")
result = calculator.calculate(
    consumption=consumption,
    prices=prices,
    subscription_monthly=Decimal("12.00"),
)

# Afficher les resultats
print(f"Total kWh: {result.total_kwh}")
print(f"Total cout: {result.total_cost_euros:.2f} EUR")
print(f"Abonnement: {result.subscription_cost_euros:.2f} EUR")
print(f"Total avec abo: {result.total_with_subscription:.2f} EUR")
print()
print("Periodes:")
for period in result.periods:
    print(f"  {period.name}: {period.consumption_kwh} kWh @ {period.unit_price} EUR = {period.cost_euros:.2f} EUR ({period.percentage}%)")
```

Executer le test :

```bash
docker compose -f dev/docker-compose.server.yml exec backend python /app/scratchpad/test_<code>.py
```

## Etape 3 : Verifier la coherence des resultats

### 3.1 Verification mathematique

| Verification                                          | Formule                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Somme des kWh = Total                                 | `sum(period.consumption_kwh) == result.total_kwh`    |
| Somme des couts = Total cout                          | `sum(period.cost_euros) == result.total_cost_euros`  |
| Pourcentages = 100%                                   | `sum(period.percentage) == 100`                      |
| Abonnement correct                                    | `subscription_monthly / 30.44 * days_count`          |

### 3.2 Verification des periodes

Verifier que chaque point de consommation est bien classe dans la bonne periode selon la logique implementee.

**Questions a se poser :**

- Les heures limites sont-elles bien gerees (ex: 22h00 est-il en HC ou HP) ?
- Le weekend est-il correctement detecte (samedi=5, dimanche=6) ?
- Les mois de saison sont-ils corrects ?

## Etape 4 : Test avec donnees variees

Tester avec differents scenarios :

| Scenario                   | Points de test                              |
| -------------------------- | ------------------------------------------- |
| Jour de semaine            | Lundi a vendredi                            |
| Week-end                   | Samedi et dimanche                          |
| Heure limite HC debut      | 22:00, 22:30, 23:00                         |
| Heure limite HC fin        | 05:30, 06:00, 06:30                         |
| Mois d'ete                 | Avril a octobre                             |
| Mois d'hiver               | Novembre a mars                             |
| Consommation nulle         | value_wh = 0                                |
| Periode de plusieurs jours | start_date != end_date                      |

## Etape 5 : Corriger les bugs

Si des problemes sont detectes :

1. Corriger le code du calculateur
2. Re-executer les tests
3. Repeter jusqu'a ce que tous les tests passent

## Recap Step 4

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ STEP 4/6 - TESTS TERMINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Auto-discovery  : [✅ OK / ❌ Echec]
Test unitaire   : [✅ OK / ❌ Echec]
Coherence math  : [✅ OK / ❌ Echec]
Scenarios       : [X/Y passes]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage au Step 5 : Seed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

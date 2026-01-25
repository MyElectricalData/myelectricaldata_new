---
name: bug-analyze
description: Analyser le bug et identifier la cause
next_step: steps/bug-fix.md
---

# Mode Bug - Etape 1/2 : Analyser le bug

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🐛 BUG ANALYZE - ETAPE 1/2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code    : <CODE>
Bug     : <description du bug>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Verifier que le type existe

```bash
curl -s http://localhost:8081/api/energy/offer-types | python3 -m json.tool | grep -A 5 '"code": "<CODE>"'
```

**Si le code n'existe pas** : Afficher un message d'erreur et terminer.

## Etape 2 : Localiser le calculateur

Identifier le fichier du calculateur :

```bash
grep -r "code.*=.*\"<CODE>\"" apps/api/src/services/offers/*.py
```

Le fichier trouve est le calculateur a analyser.

## Etape 3 : Lire le code du calculateur

Lire le fichier complet pour comprendre la logique :

```bash
cat apps/api/src/services/offers/<fichier>.py
```

**Points a analyser :**

| Element                    | Questions a se poser                                   |
| -------------------------- | ------------------------------------------------------ |
| Attributs de classe        | Les champs requis sont-ils corrects ?                  |
| Recuperation des prix      | Les cles de `prices` correspondent-elles au modele ?   |
| Boucle sur les points      | La classification est-elle correcte ?                  |
| Conditions temporelles     | Les heures/jours/mois sont-ils bien geres ?            |
| Calculs mathematiques      | Les totaux sont-ils corrects ?                         |
| Construction des periodes  | Les PeriodDetail sont-ils complets ?                   |

## Etape 4 : Reproduire le bug

### 4.1 Comprendre le bug

Analyser la description du bug :

- **Symptome** : Qu'est-ce qui ne fonctionne pas ?
- **Attendu** : Quel devrait etre le comportement correct ?
- **Contexte** : Dans quelles conditions le bug apparait ?

### 4.2 Creer un cas de test

Creer un script de test dans le scratchpad :

```python
# /private/tmp/claude/.../scratchpad/test_bug_<code>.py
"""Reproduction du bug dans <CODE>."""

from datetime import datetime, date
from decimal import Decimal
import sys
sys.path.insert(0, '/app/src')

from services.offers import get_calculator, ConsumptionData
from services.offers.base import ConsumptionPoint

# Creer des donnees qui reproduisent le bug
points = []
# ... points specifiques au bug ...

consumption = ConsumptionData(
    points=points,
    start_date=date(2024, 1, 15),
    end_date=date(2024, 1, 15),
)

# Prix de test
prices = {
    # ... prix selon le type ...
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
print()
print("Periodes:")
for period in result.periods:
    print(f"  {period.name}: {period.consumption_kwh} kWh ({period.percentage}%)")

# Verification attendue
print()
print("=== VERIFICATION ===")
print(f"Attendu: <valeur attendue>")
print(f"Obtenu:  <valeur obtenue>")
print(f"Bug reproduit: <OUI/NON>")
```

### 4.3 Executer le test

```bash
docker compose -f dev/docker-compose.server.yml exec backend python /app/scratchpad/test_bug_<code>.py
```

## Etape 5 : Identifier la cause

### 5.1 Categories de bugs courants

| Categorie             | Symptomes                                              | Cause probable                    |
| --------------------- | ------------------------------------------------------ | --------------------------------- |
| Classification        | Points dans la mauvaise periode                        | Condition temporelle incorrecte   |
| Calcul                | Totaux incorrects                                      | Erreur dans l'accumulation        |
| Heures limites        | Comportement etrange a 0h, 6h, 22h, etc.               | Operateurs < vs <= mal utilises   |
| Week-end              | samedi/dimanche mal detectes                           | weekday() != 5/6                  |
| Saison                | Mauvaise classification ete/hiver                      | Mois mal definis                  |
| Prix                  | Prix incorrect utilise                                 | Mauvaise cle dans `prices`        |
| Pourcentage           | Pourcentages qui ne font pas 100%                      | Erreur d'arrondi ou de calcul     |

### 5.2 Localiser la ligne fautive

Une fois la cause identifiee, noter :

- **Fichier** : `apps/api/src/services/offers/<fichier>.py`
- **Ligne(s)** : Numero de ligne approximatif
- **Code fautif** : Le code qui cause le bug
- **Correction proposee** : Ce qui devrait etre a la place

## Recap Etape 1

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ BUG ANALYZE - ANALYSE TERMINEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fichier       : apps/api/src/services/offers/<fichier>.py
Bug reproduit : [✅ Oui / ❌ Non]
Cause         : <description de la cause>
Ligne(s)      : ~<numero>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage a l'etape 2 : Correction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

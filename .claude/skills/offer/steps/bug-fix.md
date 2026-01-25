---
name: bug-fix
description: Corriger le bug et valider la correction
prev_step: steps/bug-analyze.md
---

# Mode Bug - Etape 2/2 : Corriger le bug

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 BUG FIX - ETAPE 2/2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fichier : apps/api/src/services/offers/<fichier>.py
Cause   : <cause identifiee>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Appliquer la correction

### 1.1 Modifier le code

Editer le fichier `apps/api/src/services/offers/<fichier>.py` pour corriger le bug.

**Regles de correction :**

- Modifier uniquement le code necessaire
- Ajouter un commentaire explicatif si la correction n'est pas evidente
- Conserver le style du code existant

### 1.2 Corrections courantes

| Bug                        | Correction                                    |
| -------------------------- | --------------------------------------------- |
| `hour >= 22` mal gere      | Verifier `>=` vs `>` selon la specification   |
| `weekday() == 5`           | Week-end = `weekday() >= 5` (5=sam, 6=dim)    |
| Mois d'hiver manquant      | `{11, 12, 1, 2, 3}` (novembre a mars)         |
| Prix non trouve            | `prices.get("key", Decimal(0))`               |
| Division par zero          | `if total_kwh > 0:` avant calcul pourcentage  |

## Etape 2 : Verifier la syntaxe

```bash
cd apps/api && uv run python -m py_compile src/services/offers/<fichier>.py
```

**Aucune erreur ne doit apparaitre.**

## Etape 3 : Relancer le test de reproduction

Utiliser le script de test cree a l'etape precedente :

```bash
docker compose -f dev/docker-compose.server.yml restart backend
sleep 5
docker compose -f dev/docker-compose.server.yml exec backend python /app/scratchpad/test_bug_<code>.py
```

**Verifier que :**

- Le bug n'est plus reproduit
- Le comportement est maintenant correct
- Les autres cas de test passent toujours

## Etape 4 : Tests de non-regression

Verifier que la correction n'a pas casse d'autres cas :

### 4.1 Cas limites a tester

| Cas                      | Description                              |
| ------------------------ | ---------------------------------------- |
| Heure 0h00               | Debut de journee                         |
| Heure 23h59              | Fin de journee                           |
| Samedi 00h00             | Debut week-end                           |
| Dimanche 23h59           | Fin week-end                             |
| 1er janvier              | Debut d'annee (mois = 1)                 |
| 31 decembre              | Fin d'annee (mois = 12)                  |
| 1er avril / 1er novembre | Changements de saison                    |
| Consommation = 0         | Pas de consommation                      |
| Un seul point            | Periode d'une demi-heure                 |

### 4.2 Script de non-regression

```python
# Test rapide de non-regression
def test_case(name, points, expected_total):
    consumption = ConsumptionData(points=points, ...)
    result = calculator.calculate(consumption, prices, subscription)
    status = "✅" if result.total_kwh == expected_total else "❌"
    print(f"{status} {name}: {result.total_kwh} kWh (attendu: {expected_total})")

test_case("Jour semaine HC", [...], Decimal("X"))
test_case("Jour semaine HP", [...], Decimal("Y"))
test_case("Week-end", [...], Decimal("Z"))
# ...
```

## Etape 5 : Lint

```bash
cd apps/api && make lint
```

**Corriger toutes les erreurs avant de continuer.**

## Etape 6 : Verification des logs

Verifier qu'il n'y a pas d'erreurs au demarrage :

```bash
docker compose -f dev/docker-compose.server.yml logs backend --tail=20 | grep -i "error\|exception"
```

## Recap Final

**Afficher a la fin :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ BUG CORRIGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fichier modifie : apps/api/src/services/offers/<fichier>.py
Bug             : <description>
Cause           : <cause>
Correction      : <description de la correction>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tests :
  - Reproduction    : ✅ Bug resolu
  - Non-regression  : ✅ Aucun cas casse
  - Lint            : ✅ Passe
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Commit (si demande)

```bash
git add apps/api/src/services/offers/<fichier>.py
git commit -m "$(cat <<'EOF'
fix(api): corriger <description courte> dans calculateur <CODE>

<Description du bug et de la correction>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

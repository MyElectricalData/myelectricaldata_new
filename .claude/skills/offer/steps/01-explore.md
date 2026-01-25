---
name: 01-explore
description: Analyser les offres existantes et definir le besoin (mode --new)
next_step: steps/02-plan.md
---

# Mode New - Step 1/6 : Explorer le contexte

**Ce fichier est utilise uniquement pour le mode `--new`.**

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 NEW - STEP 1/6 - EXPLORATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Identifier le type d'offre a creer

### Si aucun code n'est fourni

Utiliser `AskUserQuestion` :

```text
Question : "Quel code pour le nouveau type d'offre ?"

Exemples : TRI_HORAIRE, DYNAMIC, SUPER_HC, VARIABLE
Convention : MAJUSCULES, underscores, pas d'espaces
```

**ATTENDRE la reponse avant de continuer.**

### Si un code est fourni

Verifier que le code n'existe pas deja :

```bash
curl -s http://localhost:8081/api/energy/offer-types | grep -i "<CODE>"
```

**Si le code existe deja** : Afficher un message d'erreur et proposer `--info` ou `--bug`.

## Etape 2 : Analyser les offres similaires

Lire les calculateurs existants pour comprendre les patterns :

```bash
# Lister les calculateurs
ls -la apps/api/src/services/offers/*.py
```

Identifier le calculateur le plus proche du besoin :

| Besoin                      | Calculateur de reference |
| --------------------------- | ------------------------ |
| Tarif unique                | `base_offer.py`          |
| 2 tarifs selon l'heure      | `hc_hp.py`               |
| Tarifs selon jour + heure   | `tempo.py`               |
| Tarifs selon saison + heure | `seasonal.py`            |
| Week-end different          | `weekend.py`             |
| Nuit + week-end en HC       | `hc_nuit_weekend.py`     |
| Jours de pointe             | `ejp.py`                 |

## Etape 3 : Lire le calculateur de reference

Lire le fichier du calculateur de reference pour comprendre :

1. Les attributs de classe (`code`, `name`, `required_price_fields`, etc.)
2. La methode `calculate()` et sa logique
3. Les `PeriodDetail` retournes

## Etape 4 : Verifier les champs de prix disponibles

Lire le modele `EnergyOffer` pour voir les champs de prix existants :

```bash
grep -A 50 "class EnergyOffer" apps/api/src/models/energy_provider.py
```

**Question cle** : Le nouveau type d'offre necessite-t-il des champs de prix non existants ?

## Recap Step 1

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ STEP 1/6 - EXPLORATION TERMINEE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code offre      : <CODE>
Reference       : <calculateur_reference.py>
Nouveaux champs : [Oui: liste / Non]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage au Step 2 : Planification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

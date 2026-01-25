---
name: info
description: Afficher les details d'un type d'offre
---

# Mode Info - Details d'un type d'offre

**Ce mode affiche les informations detaillees d'un calculateur existant.**

## Etape 1 : Verifier que le type existe

```bash
curl -s http://localhost:8081/api/energy/offer-types | python3 -m json.tool | grep -A 15 '"code": "<CODE>"'
```

**Si le code n'existe pas** : Afficher les types disponibles et terminer.

## Etape 2 : Localiser le fichier

```bash
grep -l "code.*=.*\"<CODE>\"" apps/api/src/services/offers/*.py
```

## Etape 3 : Lire le calculateur

Lire le fichier du calculateur pour extraire :

1. **Attributs de classe** : code, name, description, icon, color
2. **Champs de prix** : required_price_fields, optional_price_fields
3. **Logique de calcul** : Comment les periodes sont determinees
4. **Periodes** : Les PeriodDetail retournes

## Etape 4 : Afficher le rapport

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DETAILS - <CODE>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Informations generales :
  Fichier     : apps/api/src/services/offers/<fichier>.py
  Classe      : <NomClasse>Calculator
  Nom         : <name>
  Description : <description>
  Icone       : <icon>
  Couleur     : <color>
  Ordre       : <display_order>

Champs de prix :
  Obligatoires :
    - <champ1>
    - <champ2>
  Optionnels :
    - <champ3>
    - <champ4>

Logique de tarification :
  <description de la logique>

Periodes tarifaires :
| Nom              | Code    | Couleur | Condition               |
| ---------------- | ------- | ------- | ----------------------- |
| <nom periode 1>  | <code1> | <color> | <condition temporelle>  |
| <nom periode 2>  | <code2> | <color> | <condition temporelle>  |
| ...              | ...     | ...     | ...                     |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Exemples de conditions temporelles

| Type d'offre      | Conditions                                    |
| ----------------- | --------------------------------------------- |
| BASE              | Toute consommation                            |
| HC_HP             | HC: 22h30-6h30, HP: reste                     |
| TEMPO             | Bleu/Blanc/Rouge + HC (22h-6h) / HP (6h-22h)  |
| EJP               | Normal: 342j, Pointe: 22j (6h-1h J+1)         |
| SEASONAL          | Ete (avr-oct) / Hiver (nov-mars) + HC/HP      |
| HC_NUIT_WEEKEND   | HC: 23h-6h sem + tout weekend, HP: reste sem  |
| WEEKEND           | Semaine/Weekend + HC/HP                       |

## Actions possibles apres info

Proposer a l'utilisateur :

```text
Actions disponibles :
  /offer <CODE> --bug <desc>   # Corriger un bug
  /offer <CODE> --delete       # Supprimer ce type
  /offer <NEW_CODE> --new      # Creer un type similaire
```

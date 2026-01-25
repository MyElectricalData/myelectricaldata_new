---
name: 02-plan
description: Definir les specifications du nouveau type d'offre (mode --new)
prev_step: steps/01-explore.md
next_step: steps/03-implement.md
---

# Mode New - Step 2/6 : Planifier les specifications

**Ce fichier est utilise uniquement pour le mode `--new`.**

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 NEW - STEP 2/6 - PLANIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Definir les attributs de classe

Utiliser `AskUserQuestion` pour collecter les informations :

### 1.1 Nom et description

```text
Question : "Quel est le nom d'affichage de cette offre ?"
Exemple : "Tri-Horaire", "Super Heures Creuses", "Dynamique"
```

```text
Question : "Decrivez brievement cette offre (1-2 phrases)"
Exemple : "3 tarifs selon l'heure : Heures Pleines, Heures Normales, Heures Creuses"
```

### 1.2 Icone et couleur

```text
Question : "Quelle icone Lucide utiliser ?"
Options :
- "zap" (defaut, energie)
- "clock" (horaire)
- "sun" (saisonnier)
- "moon" (nuit)
- "calendar" (jours specifiques)
- "palette" (multi-tarifs)
- "alert-triangle" (pointe)
- Autre (texte libre)
```

```text
Question : "Quelle couleur principale (hex) ?"
Options :
- "#3B82F6" (blue - standard)
- "#10B981" (green - economique)
- "#F59E0B" (amber - attention)
- "#8B5CF6" (purple - premium)
- "#06B6D4" (cyan - saisonnier)
- "#6366F1" (indigo - nuit)
- Autre (texte libre)
```

### 1.3 Ordre d'affichage

```text
Question : "Quel ordre d'affichage ? (les existants vont de 1 a 7)"
Suggestion : 8 (apres les existants)
```

## Etape 2 : Definir les tarifs

### 2.1 Nombre de periodes tarifaires

```text
Question : "Combien de periodes tarifaires differentes ?"
Options :
- "1" (tarif unique)
- "2" (HC/HP ou Normal/Pointe)
- "3" (Tri-horaire)
- "4" (2x2 : jour/nuit x semaine/weekend ou ete/hiver x HC/HP)
- "5+" (complexe)
```

### 2.2 Criteres de differentiation

```text
Question (multiselect) : "Sur quels criteres varient les tarifs ?"
Options :
- "Heure de la journee" (HC/HP)
- "Jour de la semaine" (semaine/weekend)
- "Saison" (ete/hiver)
- "Couleur du jour" (Tempo: bleu/blanc/rouge)
- "Jour de pointe" (EJP, jours specifiques)
- "Prix dynamique" (bourse)
```

### 2.3 Definition des periodes

Pour chaque periode, collecter :

| Information | Description                               | Exemple            |
| ----------- | ----------------------------------------- | ------------------ |
| `name`      | Nom affiche                               | "Heures Creuses"   |
| `code`      | Code technique                            | "hc"               |
| `color`     | Couleur hex pour graphiques               | "#10B981"          |
| `condition` | Condition d'application                   | "22h-6h"           |

## Etape 3 : Identifier les champs de prix

### 3.1 Champs existants a utiliser

Lister les champs du modele `EnergyOffer` qui seront utilises.

### 3.2 Nouveaux champs necessaires

Si des champs manquent, les lister avec leur type :

```text
Nouveaux champs a creer :
- tri_heure_hc : Decimal(10,5) - Prix Heures Creuses
- tri_heure_hn : Decimal(10,5) - Prix Heures Normales
- tri_heure_hp : Decimal(10,5) - Prix Heures Pleines
```

## Etape 4 : Definir la logique de calcul

Decrire en pseudo-code comment determiner la periode pour chaque point de consommation :

```text
Pour chaque point de consommation:
  1. Extraire l'heure (point.timestamp.hour)
  2. Si heure >= 22 OU heure < 6:
     → Periode "Heures Creuses" (tarif hc_price)
  3. Si heure >= 6 ET heure < 7 OU heure >= 21 ET heure < 22:
     → Periode "Heures Normales" (tarif hn_price)
  4. Sinon:
     → Periode "Heures Pleines" (tarif hp_price)
```

## Recap Step 2 + Validation OBLIGATOIRE

**Afficher le plan complet :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 STEP 2/6 - SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Attributs de classe :
- code          : <CODE>
- name          : <nom>
- description   : <description>
- icon          : <icone>
- color         : <couleur>
- display_order : <ordre>

Champs de prix :
- required : [<liste des champs obligatoires>]
- optional : [<liste des champs optionnels>]

Periodes tarifaires :
| Nom              | Code    | Couleur | Condition       |
| ---------------- | ------- | ------- | --------------- |
| Heures Creuses   | hc      | #10B981 | 22h-6h          |
| Heures Normales  | hn      | #FBBF24 | 6h-7h, 21h-22h  |
| Heures Pleines   | hp      | #F59E0B | 7h-21h          |

Nouveaux champs DB :
- <aucun / liste>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**VALIDATION OBLIGATOIRE** : Utiliser `AskUserQuestion` :

```text
Question : "Ces specifications vous conviennent-elles ?"

Options :
- "Oui, implementer" → Passer au Step 3
- "Non, modifier" → Demander les modifications
```

**NE PAS passer au Step 3 sans validation explicite.**

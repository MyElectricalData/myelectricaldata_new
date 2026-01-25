---
name: 06-validate
description: Validation finale et lint
prev_step: steps/05-seed.md
---

# Step 6/6 : Validation finale

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✔️ STEP 6/6 - VALIDATION FINALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Lint du code

Executer le lint sur le backend :

```bash
cd apps/api && make lint
```

**Corriger toutes les erreurs avant de continuer.**

## Etape 2 : Verification des logs Docker

Verifier qu'il n'y a pas d'erreurs au demarrage :

```bash
docker compose -f dev/docker-compose.server.yml logs backend --tail=50 | grep -i "error\|critical\|exception"
```

**Aucune erreur ne doit apparaitre.**

## Etape 3 : Checklist de validation

### 3.1 Fichiers crees/modifies

| Fichier                                        | Action   | Statut |
| ---------------------------------------------- | -------- | ------ |
| `apps/api/src/services/offers/<code>.py`       | Cree     | [ ]    |
| `apps/api/src/services/offers/__init__.py`     | Modifie  | [ ]    |
| `apps/api/src/models/seed.py`                  | Modifie  | [ ]    |
| `apps/api/src/models/energy_provider.py`       | Modifie? | [ ]    |
| `apps/api/alembic/versions/<migration>.py`     | Cree?    | [ ]    |

### 3.2 Tests fonctionnels

| Test                                  | Resultat |
| ------------------------------------- | -------- |
| Auto-discovery dans /offer-types      | [ ]      |
| Presence dans /pricing-types          | [ ]      |
| Calcul correct avec donnees de test   | [ ]      |
| Periodes correctement classifiees     | [ ]      |
| Totaux mathematiquement corrects      | [ ]      |

### 3.3 Documentation (optionnel mais recommande)

Si le type d'offre est significatif, mettre a jour la documentation :

| Document                                        | Section a mettre a jour               |
| ----------------------------------------------- | ------------------------------------- |
| `.claude/skills/new_offer/SKILL.md`             | Tableau "Types d'offres existants"    |
| `docs/features-spec/energy-providers-scrapers.md` | Si scraper associe                  |

## Etape 4 : Resume des modifications

**Afficher le resume complet :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 RESUME - NOUVEAU TYPE D'OFFRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Type d'offre :
- Code         : <CODE>
- Nom          : <nom>
- Description  : <description>
- Icone        : <icone>
- Couleur      : <couleur>

Tarifs :
- Obligatoires : [<liste>]
- Optionnels   : [<liste>]

Periodes :
| Nom              | Code    | Condition          |
| ---------------- | ------- | ------------------ |
| <periode 1>      | <code1> | <condition>        |
| <periode 2>      | <code2> | <condition>        |

Fichiers modifies :
- apps/api/src/services/offers/<code>.py (cree)
- apps/api/src/services/offers/__init__.py
- apps/api/src/models/seed.py
[- apps/api/alembic/versions/<migration>.py (si applicable)]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 5 : Commit (si demande)

Si l'utilisateur demande un commit, respecter `.claude/rules/commits.md` :

```bash
git add apps/api/src/services/offers/<code>.py
git add apps/api/src/services/offers/__init__.py
git add apps/api/src/models/seed.py
# Si migration
git add apps/api/alembic/versions/*.py

git commit -m "$(cat <<'EOF'
feat(api): ajouter type d'offre <CODE>

- Nouveau calculateur <NomClasse>Calculator
- <X> periodes tarifaires : <liste>
- Ajoute au seed et pricing_types

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

## Recap Final

**Afficher a la fin :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ NOUVEAU TYPE D'OFFRE CREE AVEC SUCCES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code            : <CODE>
Fichier         : apps/api/src/services/offers/<code>.py
Auto-discovery  : ✅ Actif
Endpoint API    : GET /api/energy/offer-types

Pour utiliser ce calculateur :
  from services.offers import get_calculator
  calculator = get_calculator("<CODE>")
  result = calculator.calculate(consumption, prices, subscription)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

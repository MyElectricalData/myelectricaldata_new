---
name: delete
description: Supprimer un type d'offre et ses references
---

# Mode Delete - Supprimer un type d'offre

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗑️ DELETE - SUPPRESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code a supprimer : <CODE>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Verifier que le type existe

```bash
curl -s http://localhost:8081/api/energy/offer-types | python3 -m json.tool | grep -A 5 '"code": "<CODE>"'
```

**Si le code n'existe pas** : Afficher un message d'erreur et terminer.

## Etape 2 : Identifier les fichiers concernes

### 2.1 Fichier du calculateur

```bash
grep -r "code.*=.*\"<CODE>\"" apps/api/src/services/offers/*.py
```

### 2.2 References dans __init__.py

```bash
grep "<CODE>\|<NomClasse>" apps/api/src/services/offers/__init__.py
```

### 2.3 References dans seed.py

```bash
grep -i "<CODE>" apps/api/src/models/seed.py
```

### 2.4 Offres en base de donnees

```bash
docker compose -f dev/docker-compose.server.yml exec postgres psql -U myelectricaldata -d myelectricaldata -c "SELECT COUNT(*) FROM energy_offers WHERE offer_type = '<CODE>'"
```

### 2.5 PricingType en base

```bash
docker compose -f dev/docker-compose.server.yml exec postgres psql -U myelectricaldata -d myelectricaldata -c "SELECT id FROM pricing_types WHERE code = '<CODE>'"
```

## Etape 3 : Afficher le resume des impacts

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ IMPACTS DE LA SUPPRESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fichiers a supprimer :
  - apps/api/src/services/offers/<fichier>.py

Fichiers a modifier :
  - apps/api/src/services/offers/__init__.py (import + __all__)
  - apps/api/src/models/seed.py (DEFAULT_PRICING_TYPES)

Donnees en base :
  - energy_offers : <N> offres avec offer_type = '<CODE>'
  - pricing_types : 1 enregistrement avec code = '<CODE>'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 4 : Confirmation OBLIGATOIRE

**IMPORTANT : Demander confirmation avant toute suppression.**

Utiliser `AskUserQuestion` :

```text
Question : "Confirmer la suppression du type '<CODE>' ?"

Options :
- "Oui, supprimer" → Continuer la suppression
- "Non, annuler" → Annuler et terminer
```

**NE PAS supprimer sans confirmation explicite.**

## Etape 5 : Supprimer les donnees en base

### 5.1 Supprimer les offres liees

```bash
docker compose -f dev/docker-compose.server.yml exec postgres psql -U myelectricaldata -d myelectricaldata -c "DELETE FROM energy_offers WHERE offer_type = '<CODE>'"
```

### 5.2 Supprimer le pricing_type

```bash
docker compose -f dev/docker-compose.server.yml exec postgres psql -U myelectricaldata -d myelectricaldata -c "DELETE FROM pricing_types WHERE code = '<CODE>'"
```

## Etape 6 : Supprimer le fichier calculateur

```bash
rm apps/api/src/services/offers/<fichier>.py
```

## Etape 7 : Mettre a jour __init__.py

Editer `apps/api/src/services/offers/__init__.py` :

1. Supprimer la ligne d'import :

   ```python
   from .<fichier> import <NomClasse>Calculator  # SUPPRIMER
   ```

2. Supprimer de `__all__` :

   ```python
   __all__ = [
       # ...
       "<NomClasse>Calculator",  # SUPPRIMER
       # ...
   ]
   ```

## Etape 8 : Mettre a jour seed.py

Editer `apps/api/src/models/seed.py` :

1. Supprimer l'entree dans `DEFAULT_PRICING_TYPES` :

   ```python
   DEFAULT_PRICING_TYPES = [
       # ...
       {
           "code": "<CODE>",  # SUPPRIMER CE BLOC
           # ...
       },
       # ...
   ]
   ```

2. Supprimer les offres par defaut si presentes :

   ```python
   DEFAULT_<PROVIDER>_<CODE>_OFFERS = [...]  # SUPPRIMER
   ```

## Etape 9 : Verifier la suppression

### 9.1 Redemarrer le backend

```bash
docker compose -f dev/docker-compose.server.yml restart backend
```

### 9.2 Verifier l'API

```bash
curl -s http://localhost:8081/api/energy/offer-types | python3 -m json.tool | grep '"code"'
```

**Le code <CODE> ne doit plus apparaitre.**

### 9.3 Verifier les logs

```bash
docker compose -f dev/docker-compose.server.yml logs backend --tail=20 | grep -i "error\|exception"
```

**Aucune erreur ne doit apparaitre.**

## Etape 10 : Lint

```bash
cd apps/api && make lint
```

## Recap Final

**Afficher a la fin :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ TYPE D'OFFRE SUPPRIME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Code supprime   : <CODE>

Fichiers supprimes :
  - apps/api/src/services/offers/<fichier>.py

Fichiers modifies :
  - apps/api/src/services/offers/__init__.py
  - apps/api/src/models/seed.py

Donnees supprimees :
  - <N> offres dans energy_offers
  - 1 pricing_type

Verification :
  - API         : ✅ Type absent
  - Logs        : ✅ Pas d'erreur
  - Lint        : ✅ Passe
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Commit (si demande)

```bash
git add -A apps/api/src/services/offers/
git add apps/api/src/models/seed.py
git commit -m "$(cat <<'EOF'
feat(api): supprimer type d'offre <CODE>

- Suppression du calculateur <NomClasse>Calculator
- Nettoyage des references dans seed.py et __init__.py
- Suppression des offres associees en base

BREAKING CHANGE: Le type d'offre <CODE> n'est plus disponible

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

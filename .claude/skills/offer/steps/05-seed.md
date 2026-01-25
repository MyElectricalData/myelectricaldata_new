---
name: 05-seed
description: Ajouter le type au seed et aux pricing_types
prev_step: steps/04-test.md
next_step: steps/06-validate.md
---

# Step 5/6 : Ajouter au seed

**Afficher au debut de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌱 STEP 5/6 - SEED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Etape 1 : Ajouter au DEFAULT_PRICING_TYPES

Editer `apps/api/src/models/seed.py` pour ajouter le nouveau type dans `DEFAULT_PRICING_TYPES` :

```python
DEFAULT_PRICING_TYPES = [
    # ... types existants ...
    {
        "code": "<CODE>",
        "name": "<nom>",
        "description": "<description>",
        "required_price_fields": [<champs_obligatoires>],
        "optional_price_fields": [<champs_optionnels>],
        "icon": "<icone>",
        "color": "<couleur>",
        "display_order": <ordre>,
    },
]
```

**Important** : L'ordre dans la liste doit correspondre a `display_order` pour la coherence.

## Etape 2 : Ajouter des offres par defaut (optionnel)

Si un fournisseur propose ce type d'offre, ajouter les offres dans les sections correspondantes.

### 2.1 Creer une constante pour les offres

```python
DEFAULT_<FOURNISSEUR>_<CODE>_OFFERS = [
    {
        "name": "<Nom offre> - 6 kVA",
        "offer_type": "<CODE>",
        "power_kva": 6,
        "subscription_price": Decimal("XX.XX"),
        "<champ1>": Decimal("0.XXXX"),
        "<champ2>": Decimal("0.XXXX"),
        # ...
    },
    {
        "name": "<Nom offre> - 9 kVA",
        "offer_type": "<CODE>",
        "power_kva": 9,
        "subscription_price": Decimal("XX.XX"),
        "<champ1>": Decimal("0.XXXX"),
        "<champ2>": Decimal("0.XXXX"),
        # ...
    },
    # ... autres puissances ...
]
```

### 2.2 Ajouter au seed du fournisseur

Dans la fonction `init_default_energy_offers()`, ajouter les offres :

```python
# Ajouter les offres <CODE> pour <Fournisseur>
for offer_data in DEFAULT_<FOURNISSEUR>_<CODE>_OFFERS:
    # ... creation de l'offre ...
```

## Etape 3 : Verifier le seed

### 3.1 Sur une base vierge (recommande)

```bash
# Supprimer la base et recreer
docker compose -f dev/docker-compose.server.yml down -v
docker compose -f dev/docker-compose.server.yml up -d
```

### 3.2 Sur une base existante

Les seeds sont idempotents, ils ne recreent pas ce qui existe deja :

```bash
docker compose -f dev/docker-compose.server.yml restart backend
```

Verifier les logs pour voir le seed :

```bash
docker compose -f dev/docker-compose.server.yml logs backend | grep -i "pricing\|seed"
```

## Etape 4 : Verifier en base

### 4.1 Verifier pricing_types

```bash
docker compose -f dev/docker-compose.server.yml exec postgres psql -U myelectricaldata -d myelectricaldata -c "SELECT code, name, display_order FROM pricing_types ORDER BY display_order"
```

### 4.2 Verifier energy_offers (si ajoute)

```bash
docker compose -f dev/docker-compose.server.yml exec postgres psql -U myelectricaldata -d myelectricaldata -c "SELECT name, offer_type, power_kva FROM energy_offers WHERE offer_type = '<CODE>'"
```

## Etape 5 : Verifier l'API

### 5.1 Endpoint pricing-types

```bash
curl -s http://localhost:8081/api/energy/pricing-types | python3 -m json.tool | grep -A 5 '"code": "<CODE>"'
```

### 5.2 Endpoint offer-types (auto-discovery)

```bash
curl -s http://localhost:8081/api/energy/offer-types | python3 -m json.tool | grep -A 10 '"code": "<CODE>"'
```

**Les deux endpoints doivent retourner le nouveau type.**

## Recap Step 5

**Afficher a la fin de cette etape :**

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ STEP 5/6 - SEED TERMINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pricing_types   : [✅ Ajoute / ❌ Echec]
energy_offers   : [✅ X offres ajoutees / N/A]
API pricing     : [✅ OK / ❌ Echec]
API offer-types : [✅ OK / ❌ Echec]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Passage au Step 6 : Validation finale
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

# Guide de Démarrage Rapide - Système de Tarifs

## Démarrage en 3 étapes

### 1. Initialiser les fournisseurs

```bash
docker compose exec backend python /app/migrations/init_energy_providers.py
```

**Résultat attendu :**
```
Initializing energy providers...
  ✓ Created: EDF
  ✓ Created: Enercoop
  ✓ Created: TotalEnergies

✅ Energy providers initialized!
  Created: 3
  Updated: 0
```

### 2. Récupérer les tarifs

Vous devez être connecté en tant qu'admin. Récupérez votre token JWT puis :

```bash
# Option A : Tous les fournisseurs
curl -X POST http://localhost:8081/api/admin/offers/refresh \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Option B : Un fournisseur à la fois
curl -X POST "http://localhost:8081/api/admin/offers/refresh?provider=EDF" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Résultat attendu :**
```json
{
  "success": true,
  "data": {
    "message": "Updated 3 providers (0 failed)",
    "providers_updated": 3,
    "providers_failed": 0,
    "total_offers_created": 78,
    "total_offers_updated": 0,
    "results": {
      "EDF": {
        "success": true,
        "provider": "EDF",
        "offers_created": 25,
        "offers_updated": 0,
        "total_offers": 25
      },
      "Enercoop": { ... },
      "TotalEnergies": { ... }
    }
  }
}
```

### 3. Consulter les offres

```bash
# Toutes les offres
curl http://localhost:8081/api/admin/offers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Offres EDF uniquement
curl "http://localhost:8081/api/admin/offers?provider=EDF" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Tests Rapides

### Tester les scrapers

```bash
cd apps/api

# Tous les tests
uv run pytest tests/services/test_price_scrapers/ -v

# EDF uniquement
uv run pytest tests/services/test_price_scrapers/test_edf_scraper.py -v
```

**Résultat attendu :**
```
test_edf_scraper.py::test_edf_scraper_fallback_offers PASSED
test_edf_scraper.py::test_edf_scraper_validate_data PASSED
test_edf_scraper.py::test_edf_scraper_base_offer_structure PASSED
test_edf_scraper.py::test_edf_scraper_hchp_offer_structure PASSED
test_edf_scraper.py::test_edf_scraper_tempo_offer_structure PASSED

========================= 6 passed in 0.15s =========================
```

### Tester un scraper en Python

```python
import asyncio
from apps.api.src.services.price_scrapers import EDFPriceScraper

async def test():
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()

    print(f"✓ {len(offers)} offres récupérées")

    # Afficher une offre BASE
    base = next(o for o in offers if o.offer_type == "BASE")
    print(f"\nExemple offre BASE :")
    print(f"  Nom: {base.name}")
    print(f"  Abonnement: {base.subscription_price} €/mois")
    print(f"  Prix kWh: {base.base_price} €/kWh")
    print(f"  Puissance: {base.power_kva} kVA")

asyncio.run(test())
```

## Vérifications

### Base de données

Vérifier que les tables existent :

```bash
docker compose exec backend python -c "
from src.models.database import async_session_maker
from src.models import EnergyProvider, EnergyOffer
from sqlalchemy import select
import asyncio

async def check():
    async with async_session_maker() as session:
        # Compter les fournisseurs
        result = await session.execute(select(EnergyProvider))
        providers = result.scalars().all()
        print(f'Fournisseurs: {len(providers)}')

        # Compter les offres
        result = await session.execute(select(EnergyOffer))
        offers = result.scalars().all()
        print(f'Offres: {len(offers)}')

asyncio.run(check())
"
```

### Permissions

Vérifier que votre utilisateur a la permission `offers` :

```bash
curl http://localhost:8081/api/admin/providers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Si vous obtenez une erreur 403, demandez à un super-admin de vous attribuer la permission.

## Dépannage

### Erreur : "Provider not found"

→ Vous avez oublié l'étape 1. Lancez la migration `init_energy_providers.py`

### Erreur : "Permission denied"

→ Votre compte n'a pas la permission `offers`. Connectez-vous avec un compte admin.

### Erreur : "No offers found"

→ Normal lors du premier scraping. Les scrapers utilisent les données de fallback en l'absence de scraping HTML fonctionnel.

### Aucune offre en base après refresh

→ Vérifiez les logs backend :
```bash
docker compose logs backend | grep -i "price"
```

## Documentation Complète

- **Documentation utilisateur** : `docs/features-spec/price-comparison.md`
- **Documentation fournisseurs** : `docs/fournisseurs/`
- **Résumé d'implémentation** : `IMPLEMENTATION_SUMMARY.md`

## Support

En cas de problème, vérifiez :

1. ✅ La migration a été exécutée
2. ✅ Vous êtes authentifié en tant qu'admin
3. ✅ Les logs backend ne montrent pas d'erreur
4. ✅ Les tests unitaires passent

Si tout est OK mais ça ne fonctionne toujours pas, consultez les logs détaillés du service.

# Ajout d'un nouveau fournisseur d'énergie

## 🎯 Objectif

Cette commande guide l'ajout d'un nouveau fournisseur d'énergie avec son scraper de prix.

## 📋 Informations requises

Avant de commencer, collecte les informations suivantes auprès de l'utilisateur :

### 1. Informations du fournisseur
- **Nom du fournisseur** : Ex: "Vattenfall", "Octopus Energy"
- **Site web** : URL du site officiel (ex: https://www.vattenfall.fr)
- **URL(s) source des tarifs** : Page web ou PDF contenant les grilles tarifaires

### 2. Type de source de données
- **PDF** : Fichier PDF avec grilles tarifaires (nécessite pdfminer)
- **HTML** : Page web à scraper (nécessite BeautifulSoup)
- **API** : API JSON (nécessite httpx)

### 3. Types d'offres proposées
- **BASE** : Tarif unique (prix kWh constant)
- **HC_HP** : Heures Creuses / Heures Pleines
- **TEMPO** : Tarif Tempo (bleu, blanc, rouge)
- **EJP** : Effacement Jours de Pointe
- **WEEK_END** : Tarif week-end différencié

### 4. Puissances disponibles
- Liste des puissances en kVA : généralement [3, 6, 9, 12, 15, 18, 24, 30, 36]

### 5. Label d'affichage
- Nom court pour l'interface admin (ex: "Tarifs Vattenfall (PDF officiel)")

---

## 🔧 Fichiers à créer/modifier

### 1. Créer le scraper
**Fichier** : `apps/api/src/services/price_scrapers/{provider}_scraper.py`

```python
"""
{Provider} price scraper - Fetches tariffs from {source}
"""
import re
from typing import List
import httpx
from datetime import datetime, UTC
from bs4 import BeautifulSoup  # Si HTML

from .base import BasePriceScraper, OfferData

class {Provider}Scraper(BasePriceScraper):
    """Scraper for {Provider} market offers"""

    # URL par défaut
    DEFAULT_URL = "{url}"

    # Données de fallback (à remplir avec les vrais prix)
    FALLBACK_PRICES = {
        "BASE": {
            # power_kva: {"subscription": X.XX, "kwh": X.XXXX}
        },
        "HC_HP": {
            # power_kva: {"subscription": X.XX, "hp": X.XXXX, "hc": X.XXXX}
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("{Provider}")
        self.scraper_urls = scraper_urls or [self.DEFAULT_URL]

    async def fetch_offers(self) -> List[OfferData]:
        """Fetch tariffs from source"""
        # Implémenter la logique de scraping
        pass

    async def validate_data(self, offers: List[OfferData]) -> bool:
        """Validate offer data"""
        # Implémenter la validation
        pass
```

### 2. Enregistrer le scraper
**Fichier** : `apps/api/src/services/price_scrapers/__init__.py`

Ajouter :
```python
from .{provider}_scraper import {Provider}Scraper

__all__ = [
    # ... existing ...
    "{Provider}Scraper",
]
```

### 3. Configurer le service
**Fichier** : `apps/api/src/services/price_update_service.py`

Ajouter dans `SCRAPERS` :
```python
"{Provider}": {Provider}Scraper,
```

Ajouter dans `PROVIDER_DEFAULTS` :
```python
"{Provider}": {"website": "{website_url}"},
```

### 4. Mettre à jour le frontend
**Fichier** : `apps/web/src/pages/AdminOffers.tsx`

Ajouter le label dans `urlLabels` (2 endroits) :
```typescript
'{Provider}': ['{Label pour affichage}'],
```

### 5. Mettre à jour la documentation
**Fichier** : `docs/features-spec/energy-providers-scrapers.md`

Ajouter une section pour le nouveau fournisseur.

---

## ✅ Checklist de validation

- [ ] Le scraper récupère correctement les offres
- [ ] Les données de fallback sont à jour
- [ ] Le service est bien enregistré
- [ ] Le label frontend est configuré
- [ ] La documentation est mise à jour
- [ ] Tester via `/admin/offers` > Prévisualiser

---

## 🚀 Commandes utiles

```bash
# Tester le scraper en local
docker compose exec backend python -c "
import asyncio
from src.services.price_scrapers import {Provider}Scraper

async def test():
    scraper = {Provider}Scraper()
    offers = await scraper.fetch_offers()
    print(f'Found {len(offers)} offers')
    for o in offers[:5]:
        print(f'  - {o.name}: {o.subscription_price}€/mois')

asyncio.run(test())
"

# Synchroniser vers le projet root
rsync -av --exclude='.git' --exclude='node_modules' --exclude='__pycache__' \
  apps/ /chemin/vers/root/apps/
```

---

## 📝 Notes importantes

1. **Toujours implémenter un fallback** : Les sites changent, les PDFs évoluent
2. **Logging** : Utiliser `self.logger` pour tracer les erreurs
3. **Validation** : Vérifier que les prix sont cohérents (0 < prix < 1€/kWh)
4. **Puissances** : La plupart des offres existent pour 3-36 kVA
5. **Date de validité** : Extraire `valid_from` depuis la source si possible

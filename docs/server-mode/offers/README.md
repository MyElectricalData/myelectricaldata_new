# Scrapers de Prix des Fournisseurs d'Electricite

Ce dossier contient la documentation des scrapers de prix pour chaque fournisseur d'electricite supporte par MyElectricalData.

## Vue d'ensemble

Le systeme de scraping permet de recuperer automatiquement les grilles tarifaires des fournisseurs d'electricite francais. Chaque scraper:

1. **Telecharge** les donnees depuis une source officielle (PDF ou page web)
2. **Parse** les informations pour extraire les prix TTC
3. **Valide** les donnees extraites
4. **Utilise un fallback** en cas d'echec du scraping

## Architecture commune

Tous les scrapers heritent de la classe de base `BasePriceScraper` (`apps/api/src/services/price_scrapers/base.py`).

### Classe OfferData

Structure de donnees pour une offre:

| Champ | Type | Description |
|-------|------|-------------|
| `name` | str | Nom de l'offre (ex: "Tarif Bleu - BASE 6 kVA") |
| `offer_type` | str | Type: BASE, HC_HP, TEMPO, SEASONAL, etc. |
| `description` | str | Description detaillee |
| `subscription_price` | float | Abonnement mensuel TTC (EUR/mois) |
| `base_price` | float | Prix kWh Base TTC |
| `hp_price` | float | Prix kWh Heures Pleines TTC |
| `hc_price` | float | Prix kWh Heures Creuses TTC |
| `power_kva` | int | Puissance souscrite (3, 6, 9, 12, 15, 18, 24, 30, 36 kVA) |
| `valid_from` | datetime | Date de debut de validite |
| `offer_url` | str | URL source des donnees |

### Types d'offres supportes

| Type | Description |
|------|-------------|
| `BASE` | Option tarifaire Base (prix unique) |
| `HC_HP` | Option Heures Creuses / Heures Pleines |
| `TEMPO` | Option Tempo EDF (6 tarifs selon jours) |
| `SEASONAL` | Tarifs saisonniers (hiver/ete) |
| `HC_NUIT_WEEKEND` | Heures creuses nuit et week-end |
| `BASE_WEEKEND` | Base + tarif reduit week-end |
| `HC_WEEKEND` | HC/HP + tarif reduit week-end |
| `ZEN_FLEX` | EDF Zen Flex (jours Eco/Sobriete) |

## Fournisseurs supportes

| Fournisseur | Fichier | Source | Type |
|-------------|---------|--------|------|
| [EDF](./edf.md) | `edf_scraper.py` | PDF officiel | Tarif reglemente + marche |
| [Enercoop](./enercoop.md) | `enercoop_scraper.py` | PDF officiel | 100% renouvelable |
| [TotalEnergies](./totalenergies.md) | `totalenergies_scraper.py` | PDF officiel | Marche |
| [Primeo Energie](./primeo.md) | `primeo_scraper.py` | PDF officiel | Marche |
| [Engie](./engie.md) | `engie_scraper.py` | HelloWatt | Marche |
| [Alpiq](./alpiq.md) | `alpiq_scraper.py` | PDF officiel | Marche |
| [Alterna](./alterna.md) | `alterna_scraper.py` | PDF officiel | 100% vert |
| [Ekwateur](./ekwateur.md) | `ekwateur_scraper.py` | Site web | 100% vert |
| [Vattenfall](./vattenfall.md) | `vattenfall_scraper.py` | PDF officiel | 100% vert |
| [Octopus Energy](./octopus.md) | `octopus_scraper.py` | HelloWatt | Marche |
| [UFC Que Choisir](./ufc.md) | `ufc_scraper.py` | PDF officiel | EMCE via Octopus |
| [Mint Energie](./mint.md) | `mint_scraper.py` | PDF officiel | 100% vert |

## Mise a jour des tarifs

Les tarifs sont mis a jour via l'endpoint admin : `POST /api/admin/offers/refresh`

La mise a jour recupere automatiquement les derniers tarifs depuis les sources officielles de chaque fournisseur.

## Utilisation

### Executer un scraper manuellement

```python
from src.services.price_scrapers import EDFPriceScraper

scraper = EDFPriceScraper()
offers = await scraper.scrape()

for offer in offers:
    print(f"{offer.name}: {offer.base_price} EUR/kWh")
```

### Avec des URLs personnalisees

```python
# URLs stockees en base de donnees (champ scraper_urls du provider)
custom_urls = ["https://example.com/tarifs.pdf"]
scraper = EDFPriceScraper(scraper_urls=custom_urls)
```

### Verifier si le fallback a ete utilise

```python
scraper = EDFPriceScraper()
offers = await scraper.scrape()

if scraper.used_fallback:
    print(f"Fallback utilise: {scraper.fallback_reason}")
```

## Ajouter un nouveau fournisseur

1. Creer un fichier `nouveau_scraper.py` dans `apps/api/src/services/price_scrapers/`
2. Heriter de `BasePriceScraper`
3. Implementer `fetch_offers()` et `validate_data()`
4. Definir les `FALLBACK_PRICES` avec des donnees manuelles
5. Ajouter l'export dans `__init__.py`
6. Creer la documentation dans `docs/fournisseurs/`

### Template de scraper

```python
from typing import List
from datetime import datetime, UTC
from .base import BasePriceScraper, OfferData

class NouveauScraper(BasePriceScraper):
    """Scraper pour Nouveau Fournisseur"""

    # URL source
    TARIFF_URL = "https://..."

    # Donnees de fallback TTC
    FALLBACK_PRICES = {
        "BASE": {
            6: {"subscription": 15.47, "kwh": 0.19},
            # ...
        },
    }

    def __init__(self, scraper_urls: list[str] | None = None):
        super().__init__("Nouveau Fournisseur")
        self.scraper_urls = scraper_urls or [self.TARIFF_URL]

    async def fetch_offers(self) -> List[OfferData]:
        # Implementation du scraping
        pass

    async def validate_data(self, offers: List[OfferData]) -> bool:
        # Validation des donnees
        pass
```

## Notes techniques

### Parsing PDF

- Utiliser `pdfplumber` pour les tableaux bien structures
- Utiliser `pdfminer` pour l'extraction de texte brut
- Executer le parsing dans un thread pool (`run_sync_in_thread`)

### Parsing HTML

- Utiliser `BeautifulSoup` avec le parser `html.parser`
- Identifier les tableaux de prix par leurs en-tetes
- Gerer les formats de prix francais (virgule decimale)

### Gestion des erreurs

- Toujours implementer un mecanisme de fallback
- Logger les erreurs avec le contexte
- Definir `used_fallback` et `fallback_reason` si applicable

# Comparateur de Tarifs Électricité

## Vue d'ensemble

Le comparateur de tarifs permet de récupérer automatiquement les grilles tarifaires des principaux fournisseurs d'électricité français et de les stocker en base de données.

## Fournisseurs Intégrés

- **EDF** - Tarifs réglementés (Tarif Bleu) + Zen Week-End - 49 offres
- **Enercoop** - Électricité 100% renouvelable et coopérative - 33 offres
- **TotalEnergies** - Offres de marché (Verte Fixe, Online) - 34 offres
- **Priméo Énergie** - Offre fixe avec -20% de réduction - 17 offres
- **Engie** - Électricité de référence 1 an - 17 offres
- **ALPIQ** - Électricité Stable (-8%) et Référence (-4%) - 34 offres
- **Alterna** - Électricité verte 100% locale et française - 34 offres
- **Ekwateur** - Électricité verte variable, fixe et spéciale VE - 18 offres

**Total : ~236 offres énergétiques**

Pour plus de détails sur chaque fournisseur, voir la [documentation des fournisseurs](../fournisseurs/) et la [documentation des scrapers](./energy-providers-scrapers.md).

## Architecture

### Modèles de Données

```
EnergyProvider (Fournisseur)
  ├─ id: UUID
  ├─ name: Nom du fournisseur
  ├─ logo_url: URL du logo
  ├─ website: Site web
  └─ is_active: Actif/Inactif

EnergyOffer (Offre tarifaire)
  ├─ id: UUID
  ├─ provider_id: Référence au fournisseur
  ├─ name: Nom de l'offre
  ├─ offer_type: BASE, HC_HP, TEMPO, EJP
  ├─ description: Description
  ├─ subscription_price: Abonnement mensuel (€)
  ├─ base_price: Prix kWh BASE (€)
  ├─ hc_price: Prix kWh Heures Creuses (€)
  ├─ hp_price: Prix kWh Heures Pleines (€)
  ├─ tempo_*: Prix Tempo (6 tarifs)
  ├─ power_kva: Puissance (3, 6, 9, 12, 15, 18, 24, 30, 36)
  ├─ valid_from: Date de début de validité
  ├─ valid_to: Date de fin de validité
  └─ price_updated_at: Dernière mise à jour
```

### Scrapers

Chaque fournisseur dispose d'un scraper dédié :

- `apps/api/src/services/price_scrapers/edf_scraper.py`
- `apps/api/src/services/price_scrapers/enercoop_scraper.py`
- `apps/api/src/services/price_scrapers/totalenergies_scraper.py`
- `apps/api/src/services/price_scrapers/primeo_scraper.py`
- `apps/api/src/services/price_scrapers/engie_scraper.py`
- `apps/api/src/services/price_scrapers/alpiq_scraper.py`
- `apps/api/src/services/price_scrapers/alterna_scraper.py`
- `apps/api/src/services/price_scrapers/ekwateur_scraper.py`

Les scrapers utilisent une classe de base `BasePriceScraper` qui définit l'interface commune :

```python
class BasePriceScraper(ABC):
    async def fetch_offers(self) -> List[OfferData]
    async def validate_data(self, offers: List[OfferData]) -> bool
    async def scrape(self) -> List[OfferData]
```

#### Stratégie de Scraping

1. **Tentative de scraping en direct** - Récupération depuis le site web du fournisseur
2. **Fallback sur données statiques** - Utilisation de tarifs pré-configurés en cas d'échec

Les données statiques sont mises à jour manuellement lors de changements tarifaires officiels.

## Utilisation

### 1. Initialisation des Fournisseurs

Avant la première utilisation, exécuter la migration :

```bash
docker compose exec backend python /app/migrations/init_energy_providers.py
```

Cette commande crée les 8 fournisseurs dans la base de données avec leurs URLs de scraping et logos.

### 2. Mise à Jour des Tarifs

#### Via l'API

**Mettre à jour tous les fournisseurs :**

```bash
POST /api/admin/offers/refresh
```

**Mettre à jour un fournisseur spécifique :**

```bash
POST /api/admin/offers/refresh?provider=EDF
POST /api/admin/offers/refresh?provider=Enercoop
POST /api/admin/offers/refresh?provider=TotalEnergies
POST /api/admin/offers/refresh?provider=Priméo Énergie
POST /api/admin/offers/refresh?provider=Engie
POST /api/admin/offers/refresh?provider=ALPIQ
POST /api/admin/offers/refresh?provider=Alterna
POST /api/admin/offers/refresh?provider=Ekwateur
```

**Réponse :**

```json
{
  "success": true,
  "data": {
    "message": "Updated 8 providers (0 failed)",
    "providers_updated": 8,
    "providers_failed": 0,
    "total_offers_created": 236,
    "total_offers_updated": 0,
    "results": {
      "EDF": {
        "success": true,
        "provider": "EDF",
        "offers_created": 49,
        "offers_updated": 0,
        "total_offers": 49,
        "updated_at": "2025-11-22T10:00:00Z"
      },
      "Ekwateur": {
        "success": true,
        "provider": "Ekwateur",
        "offers_created": 18,
        "offers_updated": 0,
        "total_offers": 18,
        "updated_at": "2025-11-22T10:05:00Z"
      }
    }
  }
}
```

#### Via l'Interface Admin

La page `/admin/offers` permet de :
- Prévisualiser les changements avant application (bouton "Prévisualiser")
- Rafraîchir les tarifs d'un fournisseur (bouton "Rafraîchir")
- Modifier les URLs des scrapers si nécessaire
- Voir les dates des tarifs dans chaque tuile fournisseur

### 3. Consultation des Offres

**Lister toutes les offres actives :**

```bash
GET /api/admin/offers
```

**Filtrer par fournisseur :**

```bash
GET /api/admin/offers?provider=EDF
```

**Inclure les offres inactives :**

```bash
GET /api/admin/offers?active_only=false
```

### 4. Liste des Fournisseurs

```bash
GET /api/admin/providers
```

**Réponse :**

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "uuid",
        "name": "EDF",
        "logo_url": "https://logo.clearbit.com/edf.fr",
        "website": "https://particulier.edf.fr",
        "is_active": true,
        "active_offers_count": 49,
        "created_at": "2025-11-22T09:00:00Z",
        "updated_at": "2025-11-22T10:00:00Z"
      },
      {
        "id": "uuid",
        "name": "Ekwateur",
        "logo_url": "https://logo.clearbit.com/ekwateur.fr",
        "website": "https://ekwateur.fr",
        "is_active": true,
        "active_offers_count": 18,
        "created_at": "2025-11-22T09:00:00Z",
        "updated_at": "2025-11-22T10:00:00Z"
      }
    ],
    "total": 8
  }
}
```

## Permissions

Les endpoints de gestion des offres nécessitent la permission `offers` :

- `admin.offers.view` - Voir les offres et fournisseurs
- `admin.offers.edit` - Rafraîchir les tarifs
- `admin.offers.delete` - Supprimer des offres

Par défaut, seuls les administrateurs ont accès à ces endpoints.

## Gestion de l'Historique

Le système conserve un historique des tarifs :

- **Nouvelles offres** → Créées avec `valid_from` = date du jour
- **Offres existantes** → `valid_to` est défini lors de la mise à jour
- **Offres inactives** → `is_active = false`

Cela permet de :
- Comparer l'évolution des prix dans le temps
- Recalculer des simulations historiques
- Analyser les tendances tarifaires

## Tests

Les tests unitaires vérifient :

1. **Scraping** - Les scrapers retournent des données valides
2. **Validation** - Les tarifs respectent les règles métier
3. **Cohérence** - HC < HP, Blue < White < Red (Tempo), etc.

Exécuter les tests :

```bash
cd apps/api
uv run pytest tests/services/test_price_scrapers/ -v
```

## Maintenance

### Mise à Jour des Tarifs Statiques

Lorsque les fournisseurs changent leurs tarifs, mettre à jour les constantes `FALLBACK_PRICES` dans chaque scraper :

- `apps/api/src/services/price_scrapers/edf_scraper.py`
- `apps/api/src/services/price_scrapers/enercoop_scraper.py`
- `apps/api/src/services/price_scrapers/totalenergies_scraper.py`
- `apps/api/src/services/price_scrapers/primeo_scraper.py`
- `apps/api/src/services/price_scrapers/engie_scraper.py`
- `apps/api/src/services/price_scrapers/alpiq_scraper.py`
- `apps/api/src/services/price_scrapers/alterna_scraper.py`
- `apps/api/src/services/price_scrapers/ekwateur_scraper.py`

### Ajout d'un Nouveau Fournisseur

1. Créer un nouveau scraper dans `apps/api/src/services/price_scrapers/`
2. Hériter de `BasePriceScraper`
3. Implémenter `fetch_offers()` et `validate_data()`
4. Ajouter le scraper dans `PriceUpdateService.SCRAPERS`
5. Créer les tests dans `tests/services/test_price_scrapers/`
6. Documenter dans `docs/fournisseurs/`

## Limitations

- **Scraping HTML** - Les sites web évoluent, nécessite maintenance
- **Données statiques** - Fallback manuel à mettre à jour
- **Tarifs dynamiques** - Certains fournisseurs ont des prix variables non capturés
- **Zones tarifaires** - Pas de distinction géographique (à implémenter si nécessaire)

## Évolutions Futures

- [x] Interface admin pour visualiser et comparer les offres ✅
- [x] Prévisualisation des changements avant application ✅
- [x] Modification des URLs de scraping via l'interface ✅
- [x] Affichage des dates de tarifs ✅
- [ ] Notifications lors de changements tarifaires
- [ ] Scraping JavaScript (Selenium/Playwright) pour sites dynamiques (actuellement Ekwateur utilise du HTML simple)
- [ ] Parser les PDFs au lieu d'utiliser uniquement les fallbacks
- [ ] API publique RTE pour tarifs réglementés
- [ ] Calcul automatique de recommandations personnalisées
- [ ] Export des grilles tarifaires (CSV, PDF)
- [ ] Graphiques d'évolution des prix dans le temps
- [ ] Alertes email lors de changements de tarifs

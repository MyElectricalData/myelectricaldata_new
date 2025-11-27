# Scrapers de Tarifs Énergétiques

## Vue d'ensemble

Le système de scraping automatique permet de maintenir à jour les tarifs des fournisseurs d'énergie en téléchargeant et analysant leurs grilles tarifaires officielles.

## Architecture

### Modèle de données

**Table `energy_providers`**
- `id`: UUID
- `name`: Nom du fournisseur
- `logo_url`: URL du logo (via Clearbit Logo API)
- `website`: Site web du fournisseur
- `scraper_urls`: JSON Array - URLs des grilles tarifaires (éditable)
- `is_active`: Booléen
- `created_at`, `updated_at`: Timestamps

**Logos des fournisseurs**
Les logos sont fournis par l'API Clearbit Logo (https://logo.clearbit.com/) qui retourne automatiquement le logo d'une entreprise à partir de son nom de domaine.

Format: `https://logo.clearbit.com/{domain}`

Exemples:
- EDF: `https://logo.clearbit.com/edf.fr`
- Enercoop: `https://logo.clearbit.com/enercoop.fr`
- TotalEnergies: `https://logo.clearbit.com/totalenergies.com`
- Priméo Énergie: `https://logo.clearbit.com/primeo-energie.fr`
- Engie: `https://logo.clearbit.com/engie.fr`
- ALPIQ: `https://logo.clearbit.com/alpiq.com`
- Alterna: `https://logo.clearbit.com/alterna-energie.fr`
- Ekwateur: `https://logo.clearbit.com/ekwateur.fr`

### Scrapers disponibles

| Fournisseur | Type de source | URLs | Nombre d'offres |
|-------------|----------------|------|-----------------|
| **EDF** | PDF × 2 | Tarif Bleu, Zen Week-End | 49 offres |
| **Enercoop** | PDF | Grille tarifaire | 33 offres (5 types) |
| **TotalEnergies** | PDF × 2 | Eco Electricité, Verte Fixe | 34 offres |
| **Priméo Énergie** | PDF | Offre Fixe -20% | 17 offres |
| **Engie** | PDF | Elec Référence 1 an | 17 offres |
| **ALPIQ** | PDF | Stable et Référence | 34 offres |
| **Alterna** | PDF × 3 | Locale, Française, VE | 34 offres |
| **Ekwateur** | Web | Site web tarifs | 18 offres |

**Total : ~236 offres**

## Détails des Scrapers

### 1. EDF (`edf_scraper.py`)

**Sources**:
- Tarif Bleu (réglementé): `https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/Grille_prix_Tarif_Bleu.pdf`
- Zen Week-End (marché): `https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/grille-prix-zen-week-end.pdf`

**Types d'offres**:
- BASE (9 puissances: 3-36 kVA)
- HC/HP (8 puissances: 6-36 kVA)
- TEMPO (Bleu/Blanc/Rouge × HC/HP)
- EJP (Normal/Pointe)
- WEEKEND (Semaine/Week-end × HC/HP)

**Mécanisme**:
- Téléchargement des 2 PDFs
- Parsing avec `pdfminer`
- Fallback sur données manuelles si échec

### 2. Enercoop (`enercoop_scraper.py`)

**Source**:
- Grille tarifaire officielle: `https://www.faq.enercoop.fr/hc/fr/article_attachments/29227207696786`

**Types d'offres** (33 total):
1. **BASIC WATT** (BASE) - 9 puissances
   - Prix fixe unique du kWh
2. **FLEXI WATT - Heures Creuses** (HC_HP) - 8 puissances
   - Heures Creuses / Heures Pleines selon les horaires PDL Enedis
3. **FLEXI WATT - Nuit & Week-end** (WEEKEND) - 8 puissances
   - HC : 23h-6h en semaine + tout le week-end
   - HP : 6h-23h en semaine uniquement
   - Idéal pour véhicules électriques et ballons d'eau chaude
4. **FLEXI WATT - 2 saisons** (SEASONAL) - 8 puissances
   - Été/Hiver + HC/HP
   - Option "Jour de Pointe" disponible

**Note importante sur le type WEEKEND**:
Le type `WEEKEND` utilisé par Enercoop est fonctionnellement équivalent à `HC_NUIT_WEEKEND`. Les deux utilisent :
- Semaine : HP de 6h à 23h, HC de 23h à 6h
- Week-end : toutes les heures en HC (heures creuses)

Le simulateur traite ces deux types de manière identique pour le calcul des coûts.

**Prix TTC** (applicables au 1er août 2025):
- Tous les prix incluent TVA 20%, CTA, CSPE
- Les abonnements sont identiques au tarif réglementé

**Mécanisme**:
- Téléchargement PDF
- Parsing (à implémenter)
- Fallback sur données manuelles TTC complètes

### 3. TotalEnergies (`totalenergies_scraper.py`)

**Sources**:
- Offre Essentielle: `https://www.totalenergies.fr/fileadmin/Digital/Documents-contractuels/GT/grille-tarifaire-offre-essentielle-souscrite-a-partir-du-03-03-2022-particuliers.pdf`
- Verte Fixe: `https://www.totalenergies.fr/fileadmin/Digital/Documents-contractuels/GT/grille-tarifaire-verte-fixe-particuliers.pdf`

**Types d'offres** (34 total):
1. **Verte Fixe** - Prix fixe 2 ans - Électricité verte
   - BASE: 9 puissances
   - HC/HP: 8 puissances
2. **Online** - 100% en ligne avec remise
   - BASE: 9 puissances
   - HC/HP: 8 puissances

**Mécanisme**:
- Téléchargement de 2 PDFs
- Parsing (à implémenter)
- Fallback sur données manuelles

### 4. Priméo Énergie (`primeo_scraper.py`)

**Source**:
- Offre Fixe -20%: `https://particuliers.primeo-energie.fr/wp-content/uploads/GT-Offre-Fixe-20_.pdf`

**Types d'offres** (17 total):
1. **Fixe -20%** - Prix bloqué jusqu'au 31/12/2026
   - BASE: 9 puissances (3-36 kVA)
   - HC/HP: 8 puissances (6-36 kVA)
   - Réduction de 20% sur le kWh HT vs TRV

**Particularité**:
- SSL verification désactivée (`verify=False`) à cause de problèmes de certificat
- Mécanisme de fallback robuste

### 5. Engie (`engie_scraper.py`)

**Source**:
- Elec Référence 1 an: `https://particuliers.engie.fr/content/dam/pdf/conditions-generales-et-grilles-tarifaires/electricite/Grille%20Tarifaire%20Elec%20R%C3%A9f%C3%A9rence%201%20an.pdf`

**Types d'offres** (17 total):
1. **Elec Référence 1 an** - Prix fixe pendant 1 an
   - BASE: 9 puissances (3-36 kVA)
   - HC/HP: 8 puissances (6-36 kVA)

**Mécanisme**:
- Téléchargement PDF
- Parsing (à implémenter)
- Fallback sur données manuelles (août 2025)

### 6. ALPIQ (`alpiq_scraper.py`)

**Source**:
- Grille tarifaire unique: `https://particuliers.alpiq.fr/grille-tarifaire/particuliers/gtr_elec_part.pdf`

**Types d'offres** (34 total):
1. **Électricité Stable** (-8% sur kWh HT, fixe jusqu'au 30/11/2026) - Valable au 28 octobre 2025
   - BASE: 9 puissances (3-36 kVA)
   - HC/HP: 8 puissances (6-36 kVA)
2. **Électricité Référence** (-4% sur kWh HT, indexé sur TRV) - Valable au 1er août 2025
   - BASE: 9 puissances (3-36 kVA)
   - HC/HP: 8 puissances (6-36 kVA)

**Prix TTC** (incluant accise 29.98€/MWh, CTA, TVA 20%):
- Abonnements identiques au tarif réglementé TTC
- Prix kWh calculés avec la remise sur le HT puis conversion TTC

**Mécanisme**:
- Téléchargement PDF
- Parsing (à implémenter)
- Fallback sur données manuelles TTC avec 2 offres distinctes

### 7. Alterna (`alterna_scraper.py`)

**Sources**:
- Électricité verte 100% locale: `https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b6fcff1d0a686a80761d5_76e7d2dffb9053aa443fd116a2b022f7_DOC%20Grille%20tarifaire%20electricite%20100%20locale%20fixe%201%20an%2001082025.pdf`
- Électricité verte 100% française: `https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b7b0241867184285ec473_ac29f3c6efb209797cc696cf1d421f69_DOC%20Grille%20Tarifaire%20elec%20100%20fran%C3%A7aise%20fixe%201%20an%20010825.pdf`
- Électricité verte 100% VE: `https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b3cfc505fecedaf50d6f5_a21bf56bba165b3760c175fe83b9c903_DOC%20Grille%20Tarifaire%20elec%20100%25%20VE%20010825.pdf`

**Types d'offres** (34 total):
1. **100% locale** - Garanties d'origine locales (producteurs locaux)
   - BASE: 9 puissances (3-36 kVA)
   - HC/HP: 8 puissances (6-36 kVA)
2. **100% française** - Garanties d'origine françaises
   - BASE: 9 puissances (3-36 kVA)
   - HC/HP: 8 puissances (6-36 kVA)

**Note**: L'offre Véhicule Électrique n'est pas intégrée car elle nécessite un modèle de données étendu (4 niveaux de tarification : heures super creuses).

**Prix TTC** (applicables au 02/10/2025):
- Tous les prix incluent TVA 20%, CTA, accise sur l'électricité (29.98€/MWh)
- ⚠️ Attention : les PDFs Alterna contiennent 2 tableaux (HTT et TTC), utiliser les prix TTC
- Abonnements identiques au tarif réglementé TTC

**Mécanisme**:
- Téléchargement de 3 PDFs
- Parsing avec pdfminer (à implémenter)
- Fallback sur données manuelles TTC (02/10/2025)

### 8. Ekwateur (`ekwateur_scraper.py`)

**Source**:
- Page web tarifs: `https://ekwateur.fr/prix-kwh-electricite-abonnement-ekwateur/`

**Types d'offres** (18 total):
1. **Prix variable** - Prix indexé sur le marché
   - BASE: 3 puissances (3, 6, 9 kVA)
   - HC/HP: 3 puissances (3, 6, 9 kVA)
2. **Prix fixe** - Prix fixe pendant 1 an
   - BASE: 3 puissances (3, 6, 9 kVA)
   - HC/HP: 3 puissances (3, 6, 9 kVA)
3. **Spéciale Véhicule Électrique** - Heures creuses renforcées
   - BASE: 3 puissances (3, 6, 9 kVA)
   - HC/HP: 3 puissances (3, 6, 9 kVA)

**Particularité**:
- Seul scraper utilisant le web (HTML) au lieu de PDF
- Limité à 3, 6, 9 kVA (Ekwateur ne propose pas d'autres puissances sur leur site)
- HC renforcées pour l'offre VE (0.13470€ vs 0.17040€ pour variable)

**Mécanisme**:
- Scraping HTTP avec httpx
- Parsing HTML (à implémenter)
- Fallback sur données manuelles (novembre 2025)

## Service de Mise à Jour (`price_update_service.py`)

### Méthodes principales

**`update_provider(provider_name)`**
- Récupère les URLs depuis la base de données (`provider.scraper_urls`)
- Instancie le scraper avec ces URLs
- Télécharge et parse les tarifs
- Désactive les anciennes offres
- Crée/Met à jour les nouvelles offres
- Retourne le résultat avec compteurs

**`preview_provider_update(provider_name)`** (DRY RUN)
- Scrape les tarifs SANS les sauvegarder
- Compare avec les offres actuelles en DB
- Retourne les différences:
  - `offers_to_create`: Nouvelles offres
  - `offers_to_update`: Offres modifiées avec diff des prix
  - `offers_to_deactivate`: Offres à désactiver

**`update_all_providers()`**
- Exécute `update_provider()` pour tous les fournisseurs
- Retourne un rapport global

### Gestion des URLs dynamiques

Les URLs des scrapers sont stockées en base de données dans le champ `scraper_urls` (JSON Array).

**Avantages**:
- Modifiables via l'interface admin sans redéploiement
- Historisation des changements
- Fallback sur URLs par défaut si non configurées

**Exemple de modification** (via interface admin):
```json
{
  "scraper_urls": [
    "https://nouveau-domaine.fr/grille-tarifaire.pdf",
    "https://nouveau-domaine.fr/offre-secondaire.pdf"
  ]
}
```

## Mécanisme de Fallback

Tous les scrapers implémentent un système de fallback robuste:

1. **Tentative de scraping**
   - Téléchargement du PDF
   - Parsing du contenu
   - Validation des données

2. **En cas d'erreur**
   - Log de l'erreur (warning, pas error)
   - Utilisation des données de fallback
   - Données manuelles mises à jour régulièrement

3. **Avantages**
   - Pas d'interruption de service
   - Offres toujours disponibles
   - Signalement des erreurs pour correction

## API Endpoints

### Publics
- `GET /energy/providers` - Liste des fournisseurs avec logos et URLs
- `GET /energy/offers` - Liste des offres actives avec `is_active`
- `PUT /energy/providers/{id}` - Modification des `scraper_urls`

### Admin
- `GET /admin/offers/preview?provider={name}` - Prévisualisation des changements
- `POST /admin/offers/refresh?provider={name}` - Mise à jour immédiate

## Interface Admin

### Affichage des fournisseurs

Chaque carte affiche:
- Logo (64×64px, via Clearbit)
- Nom du fournisseur
- Nombre d'offres actives
- Date de dernière mise à jour
- **URLs des scrapers** avec labels descriptifs
- Boutons: Modifier URLs, Prévisualiser, Rafraîchir

### Modal de modification des URLs

Permet d'éditer les URLs des scrapers:
- Affichage de chaque URL avec son label
- Validation avant sauvegarde
- Notification de succès/erreur

### Modal de prévisualisation

3 onglets avec badges de comptage:
1. **Nouvelles offres** (badge vert)
2. **Mises à jour** (badge bleu) - avec diff des prix
3. **Désactivations** (badge rouge)

Boutons:
- Annuler
- Appliquer les changements

## Bonnes pratiques

### Ajout d'un nouveau fournisseur

1. **Créer le scraper** dans `apps/api/src/services/price_scrapers/`
   - Hériter de `BasePriceScraper`
   - Implémenter `fetch_offers()` et `validate_data()`
   - Ajouter un mécanisme de fallback

2. **Enregistrer dans le service**
   ```python
   # price_update_service.py
   SCRAPERS = {
       "Nouveau Fournisseur": NouveauScraper,
   }
   ```

3. **Créer le provider en DB**
   ```sql
   INSERT INTO energy_providers (name, logo_url, website, scraper_urls)
   VALUES (
     'Nouveau Fournisseur',
     'https://logo.clearbit.com/nouveau-fournisseur.fr',
     'https://www.nouveau-fournisseur.fr',
     '["https://www.nouveau-fournisseur.fr/tarifs.pdf"]'::json
   );
   ```

4. **Mettre à jour le frontend**
   - Ajouter dans `hasProvider` list (AdminOffers.tsx)
   - Ajouter les labels d'URLs dans `urlLabels`

### Maintenance des URLs

Lorsqu'un fournisseur change l'URL de sa grille tarifaire:

1. Utiliser le bouton "Modifier les URLs" dans l'interface admin
2. Mettre à jour l'URL
3. Tester avec "Prévisualiser"
4. Appliquer avec "Rafraîchir"

Alternativement, mise à jour SQL directe:
```sql
UPDATE energy_providers
SET scraper_urls = '["https://nouvelle-url.pdf"]'::json
WHERE name = 'Nom du Fournisseur';
```

## Tests et Validation

### Test d'un scraper

```bash
# Via l'API
curl http://localhost:8081/admin/offers/preview?provider=EDF

# Via Python
cd apps/api
uv run python -c "
from src.services.price_scrapers.edf_scraper import EDFPriceScraper
import asyncio

async def test():
    scraper = EDFPriceScraper()
    offers = await scraper.scrape()
    print(f'Found {len(offers)} offers')
    for o in offers[:3]:
        print(f'  - {o.name}: {o.subscription_price}€ + {o.base_price}€/kWh')

asyncio.run(test())
"
```

### Validation des données

Chaque scraper implémente `validate_data()` qui vérifie:
- Prix > 0
- Puissances valides (3, 6, 9, 12, 15, 18, 24, 30, 36 kVA)
- Cohérence des prix selon le type d'offre
- Champs requis présents

## Fichiers modifiés

### Backend
- `apps/api/src/models/energy_provider.py` - Ajout de `scraper_urls` (JSON)
- `apps/api/src/routers/energy_offers.py` - Support de `scraper_urls` et `is_active`
- `apps/api/src/services/price_update_service.py` - Passage des URLs dynamiques
- `apps/api/src/services/price_scrapers/` - Tous les scrapers mis à jour
- `apps/api/migrations/add_scraper_urls_to_providers.py` - Migration SQL

### Frontend
- `apps/web/src/api/energy.ts` - Interface `EnergyProvider` avec `scraper_urls`
- `apps/web/src/pages/AdminOffers.tsx` - Affichage des logos et gestion des URLs

### Documentation
- `docs/pages/admin-offers.md` - Documentation de la page admin
- `docs/features-spec/energy-providers-scrapers.md` - Ce document

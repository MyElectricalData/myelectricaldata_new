---
sidebar_position: 2
---

# Offres Tarifaires

## Vue d'ensemble

L'interface d'administration des offres permet de gérer les fournisseurs d'énergie et leurs offres tarifaires utilisées dans le simulateur.

**Accès** : `/admin/offers` (nécessite le rôle administrateur)

---

## Fournisseurs supportés

| Fournisseur | Offres | Scraper |
|-------------|--------|---------|
| **EDF** | ~40 offres | PDF |
| **Enercoop** | ~20 offres | PDF |
| **TotalEnergies** | ~35 offres | PDF |
| **Priméo Énergie** | ~38 offres | PDF |

Total : **~133 offres** actives

---

## Interface d'administration

### Liste des fournisseurs

La page `/admin/offers` affiche :

| Colonne | Description |
|---------|-------------|
| Logo | Logo du fournisseur (via Clearbit) |
| Nom | Nom du fournisseur |
| Offres actives | Nombre d'offres actives |
| Dernière MàJ | Date du dernier scraping |
| Actions | Preview / Refresh / Edit |

### Actions disponibles

#### Preview (DRY RUN)

```
Fournisseur → Actions → Preview
```

Exécute le scraper en mode simulation :
- Récupère les nouvelles offres
- Compare avec les offres existantes
- Affiche les différences (ajouts/modifications/suppressions)
- **Ne modifie pas la base de données**

#### Refresh

```
Fournisseur → Actions → Refresh
```

Exécute le scraper et applique les changements :
- Met à jour les prix des offres existantes
- Ajoute les nouvelles offres
- Désactive les offres supprimées

#### Edit URLs

```
Fournisseur → Actions → Edit
```

Modifier les URLs de scraping :
- URL PDF des grilles tarifaires
- URL de fallback si PDF indisponible

---

## Structure d'une offre

```json
{
  "id": "uuid",
  "provider": "EDF",
  "name": "Tarif Bleu Option Base",
  "pricing_type": "BASE",
  "prices": {
    "base": 0.2516,
    "hc": null,
    "hp": null,
    "bleu_hc": null,
    "bleu_hp": null,
    "blanc_hc": null,
    "blanc_hp": null,
    "rouge_hc": null,
    "rouge_hp": null
  },
  "subscription_price": 12.44,
  "is_active": true
}
```

### Types de tarification

| Type | Description | Champs prix |
|------|-------------|-------------|
| **BASE** | Tarif unique | `base` |
| **HCHP** | Heures Creuses / Pleines | `hc`, `hp` |
| **TEMPO** | 6 prix selon couleur/heure | `bleu_hc`, `bleu_hp`, `blanc_hc`, `blanc_hp`, `rouge_hc`, `rouge_hp` |

---

## Scrapers

### Fonctionnement

1. **Téléchargement** du PDF depuis l'URL configurée
2. **Extraction** du texte via PyPDF2
3. **Parsing** des tableaux de prix
4. **Normalisation** des données
5. **Comparaison** avec les offres existantes
6. **Mise à jour** de la base de données

### URLs configurables

Chaque fournisseur a des URLs stockées en base :

```json
{
  "scraper_urls": {
    "pdf": "https://example.com/grille-tarifaire.pdf",
    "fallback": "https://example.com/prix-page.html"
  }
}
```

### Logs de scraping

Les résultats de scraping sont enregistrés :

```
Admin → Logs → Filtrer par "scraper"
```

Informations tracées :
- Date/heure d'exécution
- Fournisseur
- Offres ajoutées/modifiées/supprimées
- Erreurs éventuelles

---

## Ajouter un fournisseur

### Via l'interface

```
Admin → Offers → Ajouter un fournisseur
```

Champs requis :
- **Nom** : Nom du fournisseur
- **Slug** : Identifiant unique (ex: `edf`, `enercoop`)
- **Site web** : URL du site officiel
- **URLs scraper** : URLs des grilles tarifaires

### Via le code

```python
# apps/api/src/services/scrapers/new_provider.py

class NewProviderScraper(BaseScraper):
    """Scraper pour le nouveau fournisseur"""

    async def scrape(self) -> list[EnergyOffer]:
        # 1. Télécharger le PDF
        pdf_content = await self.download_pdf(self.config.pdf_url)

        # 2. Extraire le texte
        text = self.extract_text(pdf_content)

        # 3. Parser les offres
        offers = self.parse_offers(text)

        return offers
```

---

## Mise à jour automatique

Un job planifié met à jour les offres quotidiennement :

```python
# Exécuté à 2h du matin
scheduler.add_job(
    scraper_service.update_all_offers,
    trigger=CronTrigger(hour=2, minute=0),
)
```

### Désactiver la mise à jour automatique

```bash
# Variable d'environnement
DISABLE_OFFER_SCRAPER=true
```

---

## Fallback manuel

Si le scraping échoue, des données de fallback sont disponibles :

```python
# apps/api/src/services/scrapers/fallback_data.py

EDF_FALLBACK = [
    {
        "name": "Tarif Bleu Option Base",
        "pricing_type": "BASE",
        "prices": {"base": 0.2516},
        "subscription_price": 12.44,
    },
    # ...
]
```

Pour forcer l'utilisation du fallback :

```
Fournisseur → Actions → Use Fallback
```

---

## API Endpoints

### Lister les offres

```bash
GET /api/energy-offers
GET /api/energy-offers?provider=edf
GET /api/energy-offers?pricing_type=TEMPO
```

### Lister les fournisseurs

```bash
GET /api/energy-providers
```

### Déclencher un refresh (admin)

```bash
POST /api/admin/offers/refresh
POST /api/admin/offers/refresh?provider=edf
POST /api/admin/offers/preview  # DRY RUN
```

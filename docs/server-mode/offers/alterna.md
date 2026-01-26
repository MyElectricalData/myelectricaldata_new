# Alterna - Fournisseur d'Electricite Verte

**Fichier scraper**: `apps/api/src/services/price_scrapers/alterna_scraper.py`

## Description

Alterna propose des offres d'electricite 100% verte avec des garanties d'origine locales ou francaises. Le scraper recupere les tarifs depuis des PDFs officiels.

## URLs Sources

| Offre | URL | Type |
|-------|-----|------|
| 100% locale | `https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b6fcff1d0a686a80761d5_...` | PDF |
| 100% francaise | `https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b7b0241867184285ec473_...` | PDF |
| 100% VE | `https://cdn.prod.website-files.com/615af985c108852be8901cfa/688b3cfc505fecedaf50d6f5_...` | PDF |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Electricite verte 100% locale - Base | `BASE` | GO emises par producteurs locaux |
| Electricite verte 100% locale - HC | `HC_HP` | GO emises par producteurs locaux |
| Electricite verte 100% francaise - Base | `BASE` | GO francaises |
| Electricite verte 100% francaise - HC | `HC_HP` | GO francaises |

## Methode de scraping

### Extraction PDF avec pdfminer

```python
from pdfminer.high_level import extract_text
text = await run_sync_in_thread(_extract_pdf_text, response.content)
```

### Structure du PDF

Le PDF contient 2 pages:
- **Page 1**: Prix HTT (hors taxes)
- **Page 2**: Prix TTC (toutes taxes comprises) - ce qu'on extrait

```python
# Recherche section TTC
ttc_marker = "Tarifs TTC"
ttc_section = text.split(ttc_marker)[1]
```

### Organisation des donnees

```text
Puissances: 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA
Abonnements BASE (9 valeurs)
Prix kWh BASE (9 valeurs identiques)
Abonnements HC/HP (8 valeurs, a partir de 6 kVA)
Prix HP (8 valeurs identiques)
Prix HC (8 valeurs identiques)
```

### Extraction des prix

```python
# Extraction tous les nombres (format X,XXXX)
all_numbers = re.findall(r'(\d{1,2},\d{2,4})', ttc_section)

# Prix kWh identiques pour toutes les puissances
base_price = prices_base[0]
hp_price = prices_hp[0]
hc_price = prices_hc[0]
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC du 02/10/2025.

### Electricite verte 100% locale - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.47 EUR/mois |
| Prix kWh | 0.1857 EUR |

### Electricite verte 100% locale - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.74 EUR/mois |
| Prix HP | 0.1977 EUR |
| Prix HC | 0.1559 EUR |

### Electricite verte 100% francaise - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.47 EUR/mois |
| Prix kWh | 0.1825 EUR |

### Electricite verte 100% francaise - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.74 EUR/mois |
| Prix HP | 0.1943 EUR |
| Prix HC | 0.1533 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Prix kWh valides selon le type d'offre
- Puissance dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- 100% electricite verte avec garanties d'origine
- Offre "locale" = producteurs de la region
- Offre "francaise" = producteurs francais
- L'offre Vehicule Electrique n'est pas incluse (necessite modele etendu)

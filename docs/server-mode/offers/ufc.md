# UFC Que Choisir - Energie Moins Chere Ensemble

**Fichier scraper**: `apps/api/src/services/price_scrapers/ufc_scraper.py`

## Description

UFC Que Choisir propose l'offre "Energie Moins Chere Ensemble" (EMCE) en partenariat avec Octopus Energy. Le scraper recupere les tarifs depuis un PDF officiel.

## URL Source

| Offre | URL | Type |
|-------|-----|------|
| EMCE 2025 | `https://a.storyblok.com/f/151412/x/60a52916f7/grille-tarifaire-emce-2025.pdf` | PDF |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| EMCE 2025 - Base | `BASE` | 100% verte via Octopus Energy |
| EMCE 2025 - HC | `HC_HP` | 100% verte via Octopus Energy, heures creuses |

## Methode de scraping

### Extraction PDF avec pdfminer

```python
from pdfminer.high_level import extract_text
text = await run_sync_in_thread(_extract_pdf_text, response.content)
```

### Structure du PDF

Le PDF contient les puissances de 1 a 36 kVA:
- **BASE**: Abonnement TTC + Prix kWh TTC unique (0.1616 EUR)
- **HC/HP**: Abonnement TTC + Prix HP TTC (0.1717) + Prix HC TTC (0.1365)

### Extraction des prix kWh

```python
# Prix BASE TTC
kwh_match = re.search(r"0[,\.]161\d", text)  # 0.1616

# Prix HP TTC
hp_match = re.search(r"0[,\.]171\d", text)   # 0.1717

# Prix HC TTC
hc_match = re.search(r"0[,\.]136\d", text)   # 0.1365
```

### Filtrage des puissances residentielles

Le PDF inclut 1-36 kVA, mais on ne garde que les puissances standard:

```python
standard_powers = [3, 6, 9, 12, 15, 18, 24, 30, 36]
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC applicable au 30/10/2025.

### EMCE 2025 - Base

| Puissance | Abonnement | kWh |
|-----------|------------|-----|
| 3 kVA | 11.72 EUR | 0.1616 EUR |
| 6 kVA | 15.45 EUR | 0.1616 EUR |
| 9 kVA | 19.38 EUR | 0.1616 EUR |
| 12 kVA | 23.30 EUR | 0.1616 EUR |
| 15 kVA | 27.04 EUR | 0.1616 EUR |
| 18 kVA | 30.74 EUR | 0.1616 EUR |
| 24 kVA | 38.75 EUR | 0.1616 EUR |
| 30 kVA | 46.40 EUR | 0.1616 EUR |
| 36 kVA | 55.00 EUR | 0.1616 EUR |

### EMCE 2025 - HC/HP

| Puissance | Abonnement | HP | HC |
|-----------|------------|----|----|
| 6 kVA | 15.73 EUR | 0.1717 EUR | 0.1365 EUR |
| 9 kVA | 20.19 EUR | 0.1717 EUR | 0.1365 EUR |
| 12 kVA | 24.26 EUR | 0.1717 EUR | 0.1365 EUR |
| 15 kVA | 28.13 EUR | 0.1717 EUR | 0.1365 EUR |
| 18 kVA | 32.11 EUR | 0.1717 EUR | 0.1365 EUR |
| 24 kVA | 40.50 EUR | 0.1717 EUR | 0.1365 EUR |
| 30 kVA | 48.30 EUR | 0.1717 EUR | 0.1365 EUR |
| 36 kVA | 54.57 EUR | 0.1717 EUR | 0.1365 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Prix kWh valides
- Puissance dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- Partenariat UFC Que Choisir x Octopus Energy
- 100% electricite verte
- Prix groupes negocies collectivement
- Campagne annuelle (EMCE 2025)

# Ekwateur - Fournisseur d'Electricite Verte

**Fichier scraper**: `apps/api/src/services/price_scrapers/ekwateur_scraper.py`

## Description

Ekwateur est un fournisseur d'electricite 100% verte. Le scraper recupere les tarifs depuis leur page web officielle.

## URL Source

| Offre | URL | Type |
|-------|-----|------|
| Prix kWh | `https://ekwateur.fr/prix-kwh-electricite-abonnement-ekwateur/` | HTML |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Electricite verte - Prix fixe - Base | `BASE` | 100% verte, prix fixe |
| Electricite verte - Prix fixe - HC | `HC_HP` | 100% verte, prix fixe, heures creuses |

## Methode de scraping

### Parsing HTML avec BeautifulSoup

```python
soup = BeautifulSoup(html, "html.parser")
tables = soup.find_all("table")
```

### Structure des tableaux

La page contient 2 tableaux:
1. **Tableau kWh**: Base (3,6,9), HP (3,6,9), HC (3,6,9)
2. **Tableau abonnements**: Base (3,6,9), HC/HP (3,6,9)

```python
# Extraction prix kWh
# Recherche la ligne contenant "prix fixe" ou "electricite"
if "prix fixe" in row_text or "electricite" in row_text:
    # Extraction 9 prix: Base(3,6,9), HP(3,6,9), HC(3,6,9)
    prices = extract_prices(cells)
```

### Validation des prix

```python
# Prix kWh: entre 0.10 et 0.50 EUR
if 0.05 < price < 0.60:
    prices.append(price)

# Abonnements: entre 5 et 50 EUR/mois
if 5.0 < price < 60.0:
    subscriptions.append(price)
```

## Puissances supportees

**Uniquement 3, 6, 9 kVA**

> **Note**: Ekwateur ne propose que 3 puissances sur leur site web

## Donnees de fallback

Prix TTC decembre 2025.

### Prix fixe - Base

| Puissance | Abonnement | kWh |
|-----------|------------|-----|
| 3 kVA | 11.78 EUR | 0.1606 EUR |
| 6 kVA | 15.57 EUR | 0.1606 EUR |
| 9 kVA | 19.655 EUR | 0.1606 EUR |

### Prix fixe - HC/HP

| Puissance | Abonnement | HP | HC |
|-----------|------------|----|----|
| 3 kVA | 15.13 EUR | 0.17914 EUR | 0.14026 EUR |
| 6 kVA | 15.84 EUR | 0.17914 EUR | 0.1426 EUR |
| 9 kVA | 20.48 EUR | 0.17914 EUR | 0.1426 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Prix kWh valides
- **Puissance uniquement dans [3, 6, 9]**

## Notes

- Seulement 3 puissances proposees (3, 6, 9 kVA)
- Prix identiques pour toutes les puissances (kWh)
- 100% electricite verte
- Prix fixes

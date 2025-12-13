# Engie - Fournisseur d'Electricite

**Fichier scraper**: `apps/api/src/services/price_scrapers/engie_scraper.py`

## Description

Engie est un fournisseur historique de gaz et d'electricite. Le scraper recupere les tarifs depuis HelloWatt, un site comparateur.

## URL Source

| Offre | URL | Type |
|-------|-----|------|
| Toutes offres | `https://www.hellowatt.fr/fournisseurs/engie/tarif-prix-kwh-engie` | HTML (HelloWatt) |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Elec Reference 3 ans - Base | `BASE` | Prix fixe 3 ans |
| Elec Reference 3 ans - HC | `HC_HP` | Prix fixe 3 ans, heures creuses |
| Elec Tranquillite - Base | `BASE` | Offre standard |
| Elec Tranquillite - HC | `HC_HP` | Offre standard, heures creuses |

## Methode de scraping

### Parsing HTML HelloWatt avec BeautifulSoup

```python
soup = BeautifulSoup(html, "html.parser")
headers = soup.find_all(['h2', 'h3', 'h4'])
```

### Identification des offres par header

```python
# Headers HelloWatt: "Grille Tarifaire Elec Reference 3 ans / Base"
if 'reference 3 ans' in header_text:
    offer_name = "Elec Reference 3 ans"
if '/ base' in header_text:
    offer_type = "BASE"
```

### Extraction des tableaux de prix

Structure des tableaux HelloWatt:
- Colonne 1: Puissance (kVA)
- Colonne 2: Abonnement
- Colonne 3: Tarif Base / HP / HC

```python
# Extraction prix
price_match = re.search(r'(\d+\.?\d*)', text)
if 0 < value < 1000:  # Validation plage
    return value
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC mis a jour decembre 2025.

### Elec Reference 3 ans - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 14.97 EUR/mois |
| Prix kWh | 0.2124 EUR |

### Elec Reference 3 ans - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.57 EUR/mois |
| Prix HP | 0.2184 EUR |
| Prix HC | 0.1742 EUR |

### Elec Tranquillite - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 12.80 EUR/mois |
| Prix kWh | 0.2612 EUR |

### Elec Tranquillite - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 13.32 EUR/mois |
| Prix HP | 0.2803 EUR |
| Prix HC | 0.2144 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Puissance valide

## Notes

- Source indirecte via HelloWatt (comparateur)
- Prix mis a jour selon la date affichee sur HelloWatt
- Offres gaz non incluses (uniquement electricite)

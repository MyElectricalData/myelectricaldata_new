# Alpiq - Fournisseur d'Electricite

**Fichier scraper**: `apps/api/src/services/price_scrapers/alpiq_scraper.py`

## Description

Alpiq est un fournisseur d'electricite proposant des offres a prix fixes et indexes. Le scraper recupere les tarifs depuis 2 PDFs officiels.

## URLs Sources

| Offre | URL | Type |
|-------|-----|------|
| Electricite Stable -21,5% | `https://particuliers.alpiq.fr/grille-tarifaire/particuliers/PRIX_STABLE_18.pdf` | PDF |
| Stable -8% + Reference -4% | `https://particuliers.alpiq.fr/grille-tarifaire/particuliers/gtr_elec_part.pdf` | PDF |

## Types d'offres

| Offre | Type | Description | Validite |
|-------|------|-------------|----------|
| Electricite Stable -21,5% - Base | `BASE` | Prix fixe, -21,5% kWh HT vs TRV | jusqu'au 30/11/2027 |
| Electricite Stable -21,5% - HC | `HC_HP` | Prix fixe, -21,5% kWh HT vs TRV | jusqu'au 30/11/2027 |
| Electricite Stable -8% - Base | `BASE` | Prix fixe, -8% kWh HT vs TRV | jusqu'au 31/12/2026 |
| Electricite Stable -8% - HC | `HC_HP` | Prix fixe, -8% kWh HT vs TRV | jusqu'au 31/12/2026 |
| Electricite Reference -4% - Base | `BASE` | Prix indexe TRV, -4% kWh HT | variable |
| Electricite Reference -4% - HC | `HC_HP` | Prix indexe TRV, -4% kWh HT | variable |

## Methode de scraping

### Parsing des 2 PDFs

```python
# PDF PRIX_STABLE_18.pdf -> Offre Stable -21,5%
if "PRIX_STABLE" in url.upper():
    offers = await run_sync_in_thread(self._parse_stable_21_pdf, response.content)

# PDF gtr_elec_part.pdf -> Offres Stable -8% et Reference -4%
else:
    # Pages 1-2: Stable -8%
    # Pages 3-4: Reference -4%
    offers = await run_sync_in_thread(self._parse_general_pdf, response.content)
```

### Structure du PDF

Le PDF affiche les prix en 4 colonnes:
- TRV_HT, TRV_TTC, Alpiq_HT, Alpiq_TTC

```python
# Extraction prix kWh (format 0,XXXXXX)
all_prices = re.findall(r'(\d+[,\.]\d{5,6})', text)
# Les prix TTC Alpiq sont aux indices 3, 7, 11 (sur 12 prix)
if len(kwh_prices) >= 12:
    base_alpiq = kwh_prices[3]   # Prix Base TTC
    hp_alpiq = kwh_prices[7]     # Prix HP TTC
    hc_alpiq = kwh_prices[11]    # Prix HC TTC
```

### Abonnements identiques au TRV

Alpiq utilise les memes abonnements que le TRV:

```python
SUBSCRIPTIONS_BASE = {
    3: 11.73, 6: 15.47, 9: 19.39, 12: 23.32, 15: 27.06,
    18: 30.76, 24: 38.79, 30: 46.44, 36: 54.29
}
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC mis a jour au 11/12/2025.

### Electricite Stable -21,5% (exemple 6 kVA)

| Option | Abonnement | kWh Base | kWh HP | kWh HC |
|--------|------------|----------|--------|--------|
| Base | 15.47 EUR | 0.160979 | - | - |
| HC/HP | 15.74 EUR | - | 0.171059 | 0.136111 |

### Electricite Stable -8% (exemple 6 kVA)

| Option | Abonnement | kWh Base | kWh HP | kWh HC |
|--------|------------|----------|--------|--------|
| Base | 15.47 EUR | 0.182477 | - | - |
| HC/HP | 15.74 EUR | - | 0.194290 | 0.153331 |

### Electricite Reference -4% (exemple 6 kVA)

| Option | Abonnement | kWh Base | kWh HP | kWh HC |
|--------|------------|----------|--------|--------|
| Base | 15.47 EUR | 0.188846 | - | - |
| HC/HP | 15.74 EUR | - | 0.201173 | 0.158434 |

## Validation

- Tous les champs requis presents
- Prix de souscription > 0
- Prix kWh valides selon le type d'offre
- Puissance dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- 3 offres distinctes avec des engagements differents
- Prix kWh extraits de la colonne "Alpiq TTC"
- Abonnements identiques au Tarif Reglemente de Vente (TRV)

# Mint Energie - Fournisseur d'Electricite Verte

**Fichier scraper**: `apps/api/src/services/price_scrapers/mint_scraper.py`

## Description

Mint Energie propose des offres d'electricite verte avec differents niveaux de garantie (25%, 50%, 100% verte francaise). Le scraper recupere les tarifs depuis 3 PDFs officiels.

## URLs Sources

| Offre | URL | Type |
|-------|-----|------|
| Online & Green | `https://doc.mint-energie.com/MintEnergie/MINT_ENERGIE_Fiche_Tarifs_21912_ONLINE_GREEN.pdf` | PDF |
| Classic & Green | `https://doc.mint-energie.com/MintEnergie/MINT_ENERGIE_Fiche_Tarifs_23012_CLASSIC_GREEN.pdf` | PDF |
| Smart & Green | `https://doc.mint-energie.com/MintEnergie/MINT_ENERGIE_Fiche_Tarifs_23224_SMART_GREEN.pdf` | PDF |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Online & Green - Base | `BASE` | Indexe TRVE -11% kWh HTT, 25% verte FR |
| Online & Green - HC | `HC_HP` | Indexe TRVE -11% kWh HTT, 25% verte FR |
| Classic & Green - Base | `BASE` | Prix fixe 1 an, 50% verte FR, 75EUR offerts |
| Classic & Green - HC | `HC_HP` | Prix fixe 1 an, 50% verte FR, 75EUR offerts |
| Smart & Green - Base | `BASE` | Prix fixe 2 ans, 100% verte FR |
| Smart & Green - HC | `HC_HP` | Prix fixe 2 ans, 100% verte FR |

## Methode de scraping

### Parsing PDF avec pdfplumber

```python
import pdfplumber
with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
    text = pdf.pages[0].extract_text() or ""
```

### Structure du PDF

Le PDF a un tableau avec BASE et HC/HP cote a cote:

```text
Ligne: "15 kVA 19,07 27,06 0,1181 0,1777 15 kVA 19,43 28,15"
        ^BASE power/sub^    ^kWh HTT/TTC^  ^HC/HP power/sub^

Ligne suivante: "0,1276 0,1891 0,0946 0,1495"
                ^HP HTT/TTC^  ^HC HTT/TTC^
```

### Extraction des prix BASE

```python
# Format ligne: "power kVA sub_htt sub_ttc kwh_htt kwh_ttc power kVA..."
kwh_match = re.search(
    r'\d+\s*kVA\s+[\d,]+\s+[\d,]+\s+0,(\d{4})\s+0,(\d{4})\s+\d+\s*kVA',
    line
)
kwh_price_ttc = float(f"0.{kwh_match.group(2)}")  # 4e valeur = TTC
```

### Extraction des prix HC/HP

```python
# Format ligne isolee: "0,1276 0,1891 0,0946 0,1495"
price_match = re.match(
    r'^\s*0,(\d{4})\s+0,(\d{4})\s+0,(\d{4})\s+0,(\d{4})\s*$',
    line
)
hp_price_ttc = float(f"0.{price_match.group(2)}")  # HP TTC
hc_price_ttc = float(f"0.{price_match.group(4)}")  # HC TTC
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC mis a jour au 01/08/2025.

### Online & Green (exemple 6 kVA)

| Option | Abonnement | kWh/HP | HC |
|--------|------------|--------|----|
| Base | 15.47 EUR | 0.1777 EUR | - |
| HC/HP | 16.01 EUR | 0.1891 EUR | 0.1495 EUR |

### Classic & Green (exemple 6 kVA)

| Option | Abonnement | kWh/HP | HC |
|--------|------------|--------|----|
| Base | 15.98 EUR | 0.1952 EUR | - |
| HC/HP | 16.25 EUR | 0.2081 EUR | 0.1635 EUR |

### Smart & Green (exemple 6 kVA)

| Option | Abonnement | kWh/HP | HC |
|--------|------------|--------|----|
| Base | 17.18 EUR | 0.1952 EUR | - |
| HC/HP | 17.45 EUR | 0.2081 EUR | 0.1635 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Prix kWh valides et < 1.0 EUR
- Puissance dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- 3 offres avec differents niveaux d'engagement vert
- Online & Green: le moins cher, 25% vert FR
- Classic & Green: prix fixe 1 an, 50% vert FR, 75EUR offerts
- Smart & Green: prix fixe 2 ans, 100% vert FR
- Parsing partiel supporte (si erreur sur un PDF, continue avec les autres)

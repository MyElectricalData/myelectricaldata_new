# Primeo Energie

**Fichier scraper**: `apps/api/src/services/price_scrapers/primeo_scraper.py`

## Description

Primeo Energie propose une offre a prix fixe avec -20% sur le kWh HT par rapport au TRV. Le scraper recupere les tarifs depuis un PDF officiel.

## URL Source

| Offre | URL | Type |
|-------|-----|------|
| Offre Fixe -20% | `https://particuliers.primeo-energie.fr/wp-content/uploads/GT-Offre-Fixe-20_.pdf` | PDF |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Offre Fixe -20% - Base | `BASE` | Prix bloque jusqu'au 31/12/2026, -20% kWh HT vs TRV |
| Offre Fixe -20% - HC | `HC_HP` | Prix bloque jusqu'au 31/12/2026, -20% kWh HT vs TRV |

## Methode de scraping

### Extraction PDF avec pdfminer

```python
from pdfminer.high_level import extract_text
text = await run_sync_in_thread(_extract_pdf_text, response.content)
```

### Structure du PDF

Le PDF contient 2 tableaux:
1. **Tableau HT** (hors taxes): prix commencant a `3 kVA 8,51...`
2. **Tableau TTC** (toutes taxes comprises): prix commencant a `3 kVA 11,74...`

### Extraction des prix TTC

```python
# Recherche du tableau TTC par pattern "3 kVA11" (11.74 EUR)
ttc_match = re.search(r"3 kVA11[,\.](\d{2})", text)
ttc_start = ttc_match.start()
ttc_section = text[ttc_start:]

# Format concatene: "15,4715,749 kVA"
# - 15,47 = prix HT 6 kVA
# - 15,74 = prix TTC 6 kVA
# - 9 = debut puissance suivante
```

### Extraction prix kWh

```python
# Prix BASE TTC
kwh_match = re.search(r"0[,\.]163\d", text)  # 0.1634

# Prix HP/HC TTC
hp_match = re.search(r"0[,\.]173\d", text)   # 0.1736
hc_match = re.search(r"0[,\.]138\d", text)   # 0.1380
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC valides a partir du 04/08/2025.

### Offre Fixe -20% - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.47 EUR/mois |
| Prix kWh | 0.1634 EUR |

### Offre Fixe -20% - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.74 EUR/mois |
| Prix HP | 0.1736 EUR |
| Prix HC | 0.1380 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Puissance valide dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- Prix bloque jusqu'au 31/12/2026
- -20% de reduction sur le kWh HT par rapport au TRV
- SSL desactive pour le telechargement du PDF (probleme de certificat)
- CTA = 21,93% de la part acheminement
- TVA = 20%
- Accise = 0.02998 EUR/kWh

# Enercoop - Fournisseur d'Electricite Verte Cooperatif

**Fichier scraper**: `apps/api/src/services/price_scrapers/enercoop_scraper.py`

## Description

Enercoop est une cooperative d'electricite 100% renouvelable. Le scraper recupere les tarifs depuis un PDF officiel.

## URL Source

| Offre | URL | Type |
|-------|-----|------|
| Grille tarifaire | `https://www.faq.enercoop.fr/hc/fr/article_attachments/29227207696786` | PDF |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Basic Watt - Base | `BASE` | Tarif unique 100% renouvelable |
| Flexi Watt - Heures Creuses | `HC_HP` | HC selon contrat Enedis |
| Flexi Watt - Nuit & Week-end | `HC_NUIT_WEEKEND` | HC nuit (23h-6h) et week-end |
| Flexi Watt - 2 saisons | `SEASONAL` | Tarifs hiver/ete avec HC |

## Methode de scraping

### Extraction PDF avec pdfminer

```python
from pdfminer.high_level import extract_text
text = await run_sync_in_thread(_extract_pdf_text, response.content)
```

### Structure du PDF

Le PDF contient:
- 36 lignes par section (1-36 kVA)
- Colonnes HTT puis TTC
- Prix en format `XX,XX EUR` (abonnement) ou `0,XXXXX EUR` (kWh)

### Extraction des prix TTC

```python
# Extraction prix kWh (format 0,XXXXX €)
kwh_matches = re.findall(r'0,(\d{5})\s*€', section)
kwh_price_ttc = float(f"0.{kwh_matches[3]}")  # 4e match = TTC actuel

# Extraction abonnements TTC (index 36-71 dans la liste)
ttc_index = 35 + power  # Pour power N, prix TTC à l'index 35+N
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Options HC/HP, Nuit & Week-end et 2 saisons disponibles a partir de 6 kVA

## Donnees de fallback

Prix TTC mis a jour au 1er aout 2025.

### Basic Watt - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 16.36 EUR/mois |
| Prix kWh | 0.25388 EUR |

### Flexi Watt - Heures Creuses (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 19.52 EUR/mois |
| Prix HP | 0.27436 EUR |
| Prix HC | 0.19008 EUR |

### Flexi Watt - Nuit & Week-end (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 16.48 EUR/mois |
| Prix HP | 0.29320 EUR |
| Prix HC | 0.16537 EUR |

### Flexi Watt - 2 saisons (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 17.40 EUR/mois |
| HP Hiver | 0.31128 EUR |
| HC Hiver | 0.23096 EUR |
| HP Ete | 0.19397 EUR |
| HC Ete | 0.13579 EUR |

## Validation

- Verification presence champs requis
- Prix de souscription > 0
- Prix kWh valides selon type d'offre
- Alerte si prix base < 0.20 EUR (suspicieusement bas)

## Notes

- SCIC (Societe Cooperative d'Interet Collectif)
- 100% renouvelable garanti
- Prix variables indexes sur le marche de l'electricite verte
- Tous les prix sont TTC (incluant TVA 20%, CTA, CSPE)

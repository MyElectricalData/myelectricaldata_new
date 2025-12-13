# EDF - Electricite de France

**Fichier scraper**: `apps/api/src/services/price_scrapers/edf_scraper.py`

## Description

EDF est le fournisseur historique d'electricite en France. Le scraper recupere les tarifs reglementes (Tarif Bleu) et les offres de marche (Zen Week-End).

## URLs Sources

| Offre | URL | Type |
|-------|-----|------|
| Tarif Bleu | `https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/Grille_prix_Tarif_Bleu.pdf` | PDF |
| Zen Week-End | `https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/grille-prix-zen-week-end.pdf` | PDF |

## Types d'offres

### Tarif Bleu (Reglemente)

| Type | Code | Description |
|------|------|-------------|
| Base | `BASE` | Prix unique toute la journee |
| Heures Creuses | `HC_HP` | 2 tarifs selon les heures |
| Tempo | `TEMPO` | 6 tarifs (Bleu/Blanc/Rouge x HC/HP) |

### Zen Week-End (Marche)

| Type | Code | Description |
|------|------|-------------|
| Option Week-End | `BASE_WEEKEND` | Tarif reduit le week-end |
| HC/HP + WE | `HC_WEEKEND` | HC/HP avec tarif week-end |
| Flex | `ZEN_FLEX` | 345 jours Eco + 20 jours Sobriete |

## Methode de scraping

### Parsing PDF Tarif Bleu

1. Telecharge le PDF via `httpx`
2. Extrait le texte avec `pdfplumber`
3. Parse les sections "Option Base", "Option Heures Creuses", "Option Tempo"
4. Extrait les prix en centimes et convertit en euros

```python
# Format PDF: "3 11,73 19,52" (power subscription price_centimes)
match = re.match(r'^\s*(\d+)\s+([\d,\.]+)\s+([\d,\.]+)', line)
power = int(match.group(1))  # 3
subscription = float(match.group(2).replace(',', '.'))  # 11.73
kwh_price = float(match.group(3).replace(',', '.')) / 100  # 0.1952
```

### Parsing PDF Zen Week-End

Structure avec 2 tableaux cote a cote:
- Option Week-End: `power subscription heures_semaine weekend`
- Option HC/HP+WE: `power subscription hp_sem hc_sem hp_we hc_we`

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses et Tempo disponibles a partir de 6 kVA

## Donnees de fallback

Prix TTC mis a jour au 1er aout 2025 (-3.17% sur le kWh).

### BASE (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 12.44 EUR/mois |
| Prix kWh | 0.1952 EUR |

### HC/HP (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 16.13 EUR/mois |
| Prix HP | 0.2068 EUR |
| Prix HC | 0.1586 EUR |

### TEMPO (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 12.94 EUR/mois |
| Bleu HC | 0.1296 EUR |
| Bleu HP | 0.1609 EUR |
| Blanc HC | 0.1486 EUR |
| Blanc HP | 0.1894 EUR |
| Rouge HC | 0.1568 EUR |
| Rouge HP | 0.7562 EUR |

## Validation

- Tous les champs requis presents
- Prix de souscription > 0
- Prix kWh dans plages attendues
- Puissance dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- Tarifs reglementes fixes par la CRE
- Mise a jour 2 fois par an (1er fevrier et 1er aout)
- Les prix incluent toutes taxes (TTC)

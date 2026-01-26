# TotalEnergies - Offres Electricite

**Fichier scraper**: `apps/api/src/services/price_scrapers/totalenergies_scraper.py`

## Description

TotalEnergies propose des offres de marche avec prix fixes ou indexes. Le scraper recupere les tarifs depuis des PDFs officiels.

## URLs Sources

| Offre | URL | Type |
|-------|-----|------|
| Essentielle | `https://www.totalenergies.fr/fileadmin/Digital/Documents-contractuels/GT/grille-tarifaire-offre-essentielle-souscrite-a-partir-du-03-03-2022-particuliers.pdf` | PDF |
| Verte Fixe | `https://www.totalenergies.fr/fileadmin/Digital/Documents-contractuels/GT/grille-tarifaire-verte-fixe-particuliers.pdf` | PDF |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Verte Fixe - Base | `BASE` | Prix fixe 1 an, electricite verte |
| Verte Fixe - HC | `HC_HP` | Prix fixe 1 an, heures creuses |
| Essentielle - Base | `BASE` | Indexe TRV, option base |
| Essentielle - HC | `HC_HP` | Indexe TRV, heures creuses |
| Online - Base | `BASE` | 100% en ligne avec remise |
| Online - HC | `HC_HP` | 100% en ligne avec remise |

## Methode de scraping

### Detection du type de PDF

```python
is_essentielle = "Offre Essentielle" in text
is_verte_fixe = "Verte Fixe" in text
```

### Parsing PDF Verte Fixe

Structure avec 2 tableaux cote a cote:
- BASE (5 colonnes): `power abo_HT abo_TTC kWh_HT kWh_TTC`
- HC (7 colonnes): `power abo_HT abo_TTC hp_HT hp_TTC hc_HT hc_TTC`

```python
# Exemple ligne: "3 kVA 9,79 13,33 0,1296 0,1915"
base_match = re.match(
    r'^\s*(\d+)\s*kVA\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)',
    line
)
subscription_ttc = float(base_match.group(3).replace(',', '.'))  # 13.33
kwh_price_ttc = float(base_match.group(5).replace(',', '.'))  # 0.1915
```

### Parsing PDF Essentielle

Structure mixte avec BASE et HC sur meme ligne:
- BASE: `power abo_HT abo_TTC TRV_HT TRV_TTC remise offre_HT offre_TTC`
- HC: suite de la ligne avec meme structure

```python
# Trouve la 2e occurrence de "X kVA" pour la section HC
kva_positions = [(m.start(), m.group(1)) for m in re.finditer(r'(\d+)\s*kVA', line)]
hc_start = kva_positions[1][0]
hc_section = line[hc_start:]
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC mis a jour janvier 2025.

### Verte Fixe - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 13.20 EUR/mois |
| Prix kWh | 0.2290 EUR |

### Verte Fixe - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 16.50 EUR/mois |
| Prix HP | 0.2420 EUR |
| Prix HC | 0.1950 EUR |

### Online - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 12.00 EUR/mois |
| Prix kWh | 0.2190 EUR |

### Online - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.50 EUR/mois |
| Prix HP | 0.2320 EUR |
| Prix HC | 0.1850 EUR |

## Validation

- Prix kWh entre 0.15 et 0.40 EUR
- Abonnement > 0
- Puissance valide

## Notes

- Prix fixes pendant 1 ou 2 ans selon l'offre
- Electricite verte avec certificats d'origine
- Remises possibles pour les offres Online
- Prix indexes sur TRV pour l'offre Essentielle

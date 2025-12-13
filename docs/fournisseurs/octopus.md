# Octopus Energy France

**Fichier scraper**: `apps/api/src/services/price_scrapers/octopus_scraper.py`

## Description

Octopus Energy est un fournisseur britannique present en France. Le scraper recupere les tarifs depuis HelloWatt, un site comparateur.

## URLs Sources

| Offre | URL | Type |
|-------|-----|------|
| Eco-conso | `https://www.hellowatt.fr/fournisseurs/octopus-energy/eco-conso` | HTML |
| Eco-saison | `https://www.hellowatt.fr/fournisseurs/octopus-energy/eco-saison` | HTML |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Octopus Eco-conso - Base | `BASE` | Offre fixe |
| Octopus Eco-conso - HC | `HC_HP` | Offre fixe, heures creuses |
| Octopus Eco-saison - Base | `BASE` | -20% avril-octobre |
| Octopus Eco-saison - HC | `HC_HP` | -20% avril-octobre, heures creuses |

## Methode de scraping

### Parsing HTML HelloWatt

```python
soup = BeautifulSoup(html, "html.parser")
tables = soup.find_all("table")
```

### Structure des tableaux HelloWatt

- **Table 1 (BASE)**: Puissance | Abonnement | Tarif Base
- **Table 2 (HC/HP)**: Puissance | Abonnement | Tarif HP | Tarif HC

### Extraction des donnees

```python
# Identification type de tableau par headers
is_hchp = "tarif hp" in header_text or "heures pleines" in header_text
is_base = "tarif base" in header_text and not is_hchp

# Premiere cellule = puissance (juste un nombre)
power_match = re.match(r"^(\d+)$", first_cell)

# Classification des valeurs
# Abonnements: 5-100 EUR
# Prix kWh: 0.05-0.50 EUR
```

### Headers User-Agent

```python
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
    "Accept": "text/html,application/xhtml+xml...",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

> **Note**: Option Heures Creuses disponible a partir de 6 kVA

## Donnees de fallback

Prix TTC decembre 2025.

### Octopus Eco-conso - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.47 EUR/mois |
| Prix kWh | 0.1889 EUR |

### Octopus Eco-conso - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 15.74 EUR/mois |
| Prix HP | 0.2012 EUR |
| Prix HC | 0.1584 EUR |

### Octopus Eco-saison - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 13.19 EUR/mois |
| Prix kWh | 0.1981 EUR |

### Octopus Eco-saison - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 13.51 EUR/mois |
| Prix HP | 0.2108 EUR |
| Prix HC | 0.1668 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Prix kWh valides
- Puissance dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- Source indirecte via HelloWatt (comparateur)
- Offre Eco-saison: -20% d'avril a octobre
- Les abonnements sont plus bas pour l'offre Eco-saison
- HP vient avant HC dans les tableaux HelloWatt

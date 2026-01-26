# Vattenfall - Fournisseur d'Electricite Verte

**Fichier scraper**: `apps/api/src/services/price_scrapers/vattenfall_scraper.py`

## Description

Vattenfall est un fournisseur europeen d'electricite verte. Le scraper recupere les tarifs de l'offre "Electricite Verte Equilibre" depuis un PDF officiel.

## URL Source

| Offre | URL | Type |
|-------|-----|------|
| Electricite Verte Equilibre | `https://www.vattenfall.fr/sites/default/files/documents/2025-11/25_08-B2C-GT-Elec_Verte_Equilibre_1.pdf` | PDF |

## Types d'offres

| Offre | Type | Description |
|-------|------|-------------|
| Electricite Verte Equilibre - Base | `BASE` | Tarif indexe sur TRV |
| Electricite Verte Equilibre - HC | `HC_HP` | Tarif indexe sur TRV, heures creuses |

## Methode de scraping

### Extraction PDF avec pdfminer

```python
from pdfminer.high_level import extract_text
text = await run_sync_in_thread(_extract_pdf_text, response.content)
```

### Structure du PDF

Le PDF affiche:
- Abonnement mensuel (EUR) - colonne "Offre Vattenfall TTC"
- Prix du kWh (cts EUR/kWh) - colonne "Offre Vattenfall TTC"

### Extraction des prix

Les prix sont extraits par pattern matching:

```python
# Prix BASE TTC: 18.72 cts/kWh = 0.1872 EUR/kWh
kwh_match = re.search(r"18[,\.]72", text)

# Prix HP TTC: 19.94 cts/kWh = 0.1994 EUR/kWh
hp_match = re.search(r"19[,\.]94", text)

# Prix HC TTC: 15.71 cts/kWh = 0.1571 EUR/kWh
hc_match = re.search(r"15[,\.]71", text)
```

### Abonnements TTC

Les abonnements sont codes en dur (extraits du PDF):

```python
base_subscriptions = {
    3: 12.86, 6: 16.60, 9: 21.66, 12: 25.59, 15: 29.33,
    18: 33.03, 24: 41.06, 30: 48.71, 36: 56.56
}

hchp_subscriptions = {
    3: 13.31, 6: 17.14, 9: 22.48, 12: 26.55, 15: 30.42,
    18: 34.40, 24: 42.80, 30: 50.61, 36: 58.47
}
```

## Puissances supportees

3, 6, 9, 12, 15, 18, 24, 30, 36 kVA

## Donnees de fallback

Prix TTC en vigueur a compter du 1er aout 2025.

### Electricite Verte Equilibre - Base (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 16.60 EUR/mois |
| Prix kWh | 0.1872 EUR |

### Electricite Verte Equilibre - HC (exemple 6 kVA)

| Champ | Valeur |
|-------|--------|
| Abonnement | 17.14 EUR/mois |
| Prix HP | 0.1994 EUR |
| Prix HC | 0.1571 EUR |

## Validation

- Champs requis presents
- Prix de souscription > 0
- Prix kWh valides selon le type d'offre
- Puissance dans [3, 6, 9, 12, 15, 18, 24, 30, 36]

## Notes

- Tarif indexe sur le TRV (Tarif Reglemente de Vente)
- 100% electricite verte
- Prix kWh identiques pour toutes les puissances
- Abonnements differents selon la puissance

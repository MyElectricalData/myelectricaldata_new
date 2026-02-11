# Exemple d'import JSON batch

Ce document fournit des exemples concrets d'import JSON pour la contribution d'offres d'énergie.

## Formats supportés

Le système supporte **deux formats** d'import JSON :

### Format 1 : Array direct (simple)

```json
[
  {
    "contribution_type": "NEW_OFFER",
    "existing_provider_id": "uuid-du-fournisseur",
    "offer_name": "Nom de l'offre",
    "offer_type": "BASE",
    "valid_from": "2025-01-01",
    "price_sheet_url": "https://fournisseur.fr/grille-tarifaire.pdf",
    "power_variants": [
      {
        "power_kva": 6,
        "subscription_price": 13.95,
        "base_price": 18.50
      }
    ]
  }
]
```

### Format 2 : Wrapper avec métadonnées (recommandé)

```json
{
  "provider_name": "EDF",
  "data_source": "https://www.edf.fr/grille-tarifaire",
  "extraction_date": "2026-02-09",
  "offers": [
    {
      "contribution_type": "NEW_OFFER",
      "existing_provider_id": "uuid-du-fournisseur",
      "offer_name": "Nom de l'offre",
      "offer_type": "BASE",
      "valid_from": "2025-01-01",
      "price_sheet_url": "https://fournisseur.fr/grille-tarifaire.pdf",
      "power_variants": [
        {
          "power_kva": 6,
          "subscription_price": 13.95,
          "base_price": 18.50
        }
      ]
    }
  ]
}
```

Le **format avec wrapper** est recommandé car il permet de tracer la source des données.

## Offres historiques (avec date de fin)

Pour ajouter plusieurs grilles tarifaires d'une même offre (ex: changements de prix au cours du temps), utilisez le format avec wrapper :

```json
{
  "provider_name": "EDF",
  "data_source": "https://www.edf.fr/grille-tarifaire-tempo.pdf",
  "extraction_date": "2026-02-09",
  "offers": [
    {
      "contribution_type": "NEW_OFFER",
      "existing_provider_id": "uuid-edf",
      "offer_name": "Tarif Bleu - Option Tempo (Février-Juillet 2025)",
    "offer_type": "TEMPO",
    "valid_from": "2025-02-01",
    "pricing_data": {
      "valid_to": "2025-07-31"
    },
    "price_sheet_url": "https://www.edf.fr/grille-tarifaire.pdf",
    "power_variants": [
      {
        "power_kva": 6,
        "subscription_price": 13.95,
        "tempo_blue_hc": 12.88,
        "tempo_blue_hp": 15.52,
        "tempo_white_hc": 14.47,
        "tempo_white_hp": 17.92,
        "tempo_red_hc": 15.18,
        "tempo_red_hp": 65.86
      },
      {
        "power_kva": 9,
        "subscription_price": 17.45,
        "tempo_blue_hc": 12.88,
        "tempo_blue_hp": 15.52,
        "tempo_white_hc": 14.47,
        "tempo_white_hp": 17.92,
        "tempo_red_hc": 15.18,
        "tempo_red_hp": 65.86
      }
    ]
    },
    {
      "contribution_type": "NEW_OFFER",
      "existing_provider_id": "uuid-edf",
      "offer_name": "Tarif Bleu - Option Tempo (Août 2025-Janvier 2026)",
      "offer_type": "TEMPO",
      "valid_from": "2025-08-01",
      "pricing_data": {
        "valid_to": "2026-01-31"
      },
      "price_sheet_url": "https://www.edf.fr/grille-tarifaire.pdf",
      "power_variants": [
        {
          "power_kva": 6,
          "subscription_price": 15.50,
          "tempo_blue_hc": 12.32,
          "tempo_blue_hp": 14.94,
          "tempo_white_hc": 13.91,
          "tempo_white_hp": 17.30,
          "tempo_red_hc": 14.60,
          "tempo_red_hp": 64.68
        },
        {
          "power_kva": 9,
          "subscription_price": 19.49,
          "tempo_blue_hc": 12.32,
          "tempo_blue_hp": 14.94,
          "tempo_white_hc": 13.91,
          "tempo_white_hp": 17.30,
          "tempo_red_hc": 14.60,
          "tempo_red_hp": 64.68
        }
      ]
    }
  ]
}
```

## Points importants

### 1. Offres expirées vs offres actives

- **Offre active** (pas de date de fin) : Ne pas mettre `valid_to`
- **Offre expirée** : Mettre `valid_to` dans `pricing_data`

```json
{
  "valid_from": "2025-01-01",
  "pricing_data": {
    "valid_to": "2025-12-31"  // ← Correct pour offre expirée
  }
}
```

❌ **Ne PAS faire** :

```json
{
  "valid_from": "2025-01-01",
  "valid_until": "2025-12-31"  // ← INCORRECT : champ ignoré, l'offre sera créée comme active !
}
```

**ATTENTION** : Si vous mettez `valid_until` à la racine, le système l'**ignore complètement** et crée l'offre comme **active** (sans date de fin). Vous devez **obligatoirement** mettre `valid_to` dans l'objet `pricing_data`.

### 2. Format des prix

Les prix doivent être **en centimes** (ou en euros décimaux, selon le contexte) :

```json
{
  "subscription_price": 13.95,  // 13.95 €/mois
  "base_price": 18.50           // 18.50 c€/kWh (ou 0.1850 €/kWh)
}
```

### 3. Tri automatique

Les contributions sont **automatiquement triées par `valid_from`** avant création. L'ordre dans le JSON n'a pas d'importance :

```json
[
  { "valid_from": "2025-08-01", ... },  // Sera créée en 2ème
  { "valid_from": "2025-02-01", ... }   // Sera créée en 1er (ordre corrigé)
]
```

### 4. Types d'offres supportés

| Type            | Champs de prix requis                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| BASE            | `base_price`                                                                          |
| HC_HP           | `hc_price`, `hp_price`                                                                |
| TEMPO           | `tempo_blue_hc`, `tempo_blue_hp`, `tempo_white_hc`, `tempo_white_hp`, `tempo_red_hc`, `tempo_red_hp` |
| EJP             | `ejp_normal`, `ejp_peak`                                                              |
| SEASONAL        | `hc_price_winter`, `hp_price_winter`, `hc_price_summer`, `hp_price_summer`           |
| BASE_WEEKEND    | `base_price`, `base_price_weekend`                                                    |

## Exemples par type d'offre

### Offre BASE

```json
{
  "contribution_type": "NEW_OFFER",
  "existing_provider_id": "uuid-fournisseur",
  "offer_name": "Offre BASE Simple",
  "offer_type": "BASE",
  "valid_from": "2025-01-01",
  "price_sheet_url": "https://...",
  "power_variants": [
    {
      "power_kva": 6,
      "subscription_price": 11.50,
      "base_price": 17.20
    }
  ]
}
```

### Offre HC/HP

```json
{
  "contribution_type": "NEW_OFFER",
  "existing_provider_id": "uuid-fournisseur",
  "offer_name": "Heures Creuses Classique",
  "offer_type": "HC_HP",
  "valid_from": "2025-01-01",
  "price_sheet_url": "https://...",
  "power_variants": [
    {
      "power_kva": 6,
      "subscription_price": 13.20,
      "hc_price": 16.50,
      "hp_price": 21.30
    }
  ]
}
```

### Offre TEMPO

```json
{
  "contribution_type": "NEW_OFFER",
  "existing_provider_id": "uuid-edf",
  "offer_name": "Tarif Bleu TEMPO",
  "offer_type": "TEMPO",
  "valid_from": "2025-01-01",
  "price_sheet_url": "https://...",
  "power_variants": [
    {
      "power_kva": 6,
      "subscription_price": 13.95,
      "tempo_blue_hc": 12.88,
      "tempo_blue_hp": 15.52,
      "tempo_white_hc": 14.47,
      "tempo_white_hp": 17.92,
      "tempo_red_hc": 15.18,
      "tempo_red_hp": 65.86
    }
  ]
}
```

### Offre EJP

```json
{
  "contribution_type": "NEW_OFFER",
  "existing_provider_id": "uuid-edf",
  "offer_name": "Tarif EJP",
  "offer_type": "EJP",
  "valid_from": "2025-01-01",
  "price_sheet_url": "https://...",
  "power_variants": [
    {
      "power_kva": 9,
      "subscription_price": 14.50,
      "ejp_normal": 13.20,
      "ejp_peak": 55.80
    }
  ]
}
```

## Conversion depuis votre format

Si vous avez un JSON au format :

```json
{
  "valid_from": "2025-02-01",
  "valid_until": "2025-07-31",  // ← À convertir
  "power_variants": [
    {
      "tempo_blue_hc": 0.128800  // ← Prix en euros
    }
  ]
}
```

Convertissez en :

```json
{
  "valid_from": "2025-02-01",
  "pricing_data": {
    "valid_to": "2025-07-31"  // ← Correct
  },
  "power_variants": [
    {
      "tempo_blue_hc": 12.88  // ← Prix en centimes (0.128800 × 100)
    }
  ]
}
```

## Cas d'usage : Historique tarifaire complet

Pour documenter l'évolution des tarifs d'une offre sur plusieurs années :

```json
[
  {
    "offer_name": "Tarif Bleu BASE (2023)",
    "valid_from": "2023-01-01",
    "pricing_data": { "valid_to": "2023-12-31" },
    "power_variants": [{ "power_kva": 6, "subscription_price": 11.20, "base_price": 16.80 }]
  },
  {
    "offer_name": "Tarif Bleu BASE (2024)",
    "valid_from": "2024-01-01",
    "pricing_data": { "valid_to": "2024-12-31" },
    "power_variants": [{ "power_kva": 6, "subscription_price": 12.10, "base_price": 17.50 }]
  },
  {
    "offer_name": "Tarif Bleu BASE (2025)",
    "valid_from": "2025-01-01",
    "power_variants": [{ "power_kva": 6, "subscription_price": 13.00, "base_price": 18.20 }]
  }
]
```

Les deux premières offres seront marquées comme expirées (`valid_to` défini), la dernière sera l'offre active.

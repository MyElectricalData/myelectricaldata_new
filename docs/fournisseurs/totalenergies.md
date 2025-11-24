# TotalEnergies - Offres Électricité

## URLs Sources

### Grille Tarifaire
- URL : https://totalenergies.fr/particuliers/electricite-gaz/offres/electricite
- Type : Page HTML dynamique (JavaScript)
- Mise à jour : Variable selon les offres

### Comparateur TotalEnergies
- URL : https://totalenergies.fr/particuliers/comparateur-energie
- Permet de récupérer les tarifs en fonction de la zone et de la puissance

## Types d'Offres

### 1. Offre Verte Fixe
- Prix fixe pendant 1, 2 ou 3 ans
- Électricité verte (certificats d'origine)
- Option Base ou Heures Creuses

### 2. Offre Online
- Prix indexé avec remise
- Gestion 100% en ligne
- Option Base ou Heures Creuses

### 3. Offre Classique
- Prix de marché
- Service client standard

## Structure des Données

### Format Attendu

```json
{
  "provider": "TotalEnergies",
  "offers": [
    {
      "name": "Verte Fixe - Base",
      "type": "market",
      "description": "Offre électricité verte à prix fixe pendant 2 ans - Option Base",
      "duration_months": 24,
      "prices": {
        "base": {
          "subscription_monthly": 13.20,
          "price_kwh": 0.2290
        }
      },
      "power_range": [3, 6, 9, 12, 15, 18],
      "green_energy": true,
      "fixed_price": true,
      "updated_at": "2025-11-01T00:00:00Z"
    },
    {
      "name": "Verte Fixe - Heures Creuses",
      "type": "market",
      "description": "Offre électricité verte à prix fixe pendant 2 ans - Heures Creuses",
      "duration_months": 24,
      "prices": {
        "hp": {
          "subscription_monthly": 16.50,
          "price_kwh": 0.2420
        },
        "hc": {
          "subscription_monthly": 16.50,
          "price_kwh": 0.1950
        }
      },
      "power_range": [6, 9, 12, 15, 18],
      "green_energy": true,
      "fixed_price": true,
      "updated_at": "2025-11-01T00:00:00Z"
    },
    {
      "name": "Online - Base",
      "type": "market",
      "description": "Offre 100% en ligne avec remise - Option Base",
      "prices": {
        "base": {
          "subscription_monthly": 12.00,
          "price_kwh": 0.2190
        }
      },
      "power_range": [3, 6, 9, 12, 15, 18],
      "discount_percent": 10,
      "online_only": true,
      "updated_at": "2025-11-01T00:00:00Z"
    }
  ]
}
```

## Méthode de Scraping

### Scraping JavaScript
- Utiliser Selenium ou Playwright pour charger le JavaScript
- Attendre le chargement du comparateur
- Extraire les données des offres

### Alternative : API Interne
- Analyser les requêtes XHR du comparateur
- Reproduire les appels API si disponibles
- Format JSON direct

## Notes Importantes

- Site hautement dynamique (React/Vue.js)
- Les prix peuvent varier selon la localisation (zone tarifaire)
- Offres promotionnelles fréquentes
- Durées d'engagement variables (1, 2 ou 3 ans pour les offres fixes)
- Remises possibles (parrainage, offres spéciales)
- Prix indexés sur les tarifs réglementés ou sur le marché

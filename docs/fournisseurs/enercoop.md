# Enercoop - Fournisseur d'Électricité Verte Coopératif

## URLs Sources

### Grille Tarifaire Officielle
- URL : https://www.enercoop.fr/nos-offres/particuliers/
- Type : Page HTML avec grille tarifaire
- Mise à jour : Variable (suivant l'évolution du marché)

### FAQ Tarifs
- URL : https://www.faq.enercoop.fr/
- Informations complémentaires sur les tarifs

## Types d'Offres

### 1. Offre Particuliers
- **Option Base** : Prix unique
- **Option Heures Creuses** : 2 tarifs (HC/HP)

### 2. Particularités Enercoop
- Électricité 100% renouvelable
- Coopérative (sociétaires = actionnaires)
- Prix variable indexé sur le marché de l'électricité verte
- Transparence totale sur l'origine de l'électricité

## Structure des Données

### Format Attendu

```json
{
  "provider": "Enercoop",
  "offers": [
    {
      "name": "Offre Particuliers - Base",
      "type": "market",
      "description": "Électricité 100% renouvelable et coopérative - Option Base",
      "prices": {
        "base": {
          "subscription_monthly": 14.90,
          "price_kwh": 0.2350
        }
      },
      "power_range": [3, 6, 9, 12, 15, 18],
      "green_energy": true,
      "updated_at": "2025-11-01T00:00:00Z"
    },
    {
      "name": "Offre Particuliers - Heures Creuses",
      "type": "market",
      "description": "Électricité 100% renouvelable et coopérative - Heures Creuses",
      "prices": {
        "hp": {
          "subscription_monthly": 17.80,
          "price_kwh": 0.2480
        },
        "hc": {
          "subscription_monthly": 17.80,
          "price_kwh": 0.1990
        }
      },
      "power_range": [6, 9, 12, 15, 18],
      "green_energy": true,
      "updated_at": "2025-11-01T00:00:00Z"
    }
  ]
}
```

## Méthode de Scraping

### Scraping HTML
- Parser la page des offres avec BeautifulSoup4
- Extraire le tableau de tarifs
- Identifier les puissances disponibles

### Particularités
- Les prix peuvent varier plus fréquemment que les tarifs réglementés
- Nécessite de vérifier régulièrement les mises à jour
- La grille tarifaire peut être en PDF (nécessite extraction)

## Notes Importantes

- Enercoop est une SCIC (Société Coopérative d'Intérêt Collectif)
- Garantie d'origine française et renouvelable à 100%
- Prix fixés par Enercoop (non réglementés)
- Possibilité de devenir sociétaire
- Transparence sur l'approvisionnement électrique

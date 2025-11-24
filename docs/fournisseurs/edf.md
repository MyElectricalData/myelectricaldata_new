# EDF - Électricité de France

## URLs Sources

### Tarifs Réglementés (Tarif Bleu)
- URL : https://particulier.edf.fr/content/dam/2-Actifs/Documents/Offres/Grille_prix_Tarif_Bleu.pdf
- Type : Document PDF avec grille tarifaire
- Mise à jour : 2 fois par an (généralement 1er février et 1er août)
- Dernière baisse : 1er août 2025 (-3.17% sur le prix du kWh)

### API Données Publiques
- URL : https://data.rte-france.com/ (via RTE)
- Format : JSON
- Authentification : API Key (si nécessaire)

## Types d'Offres

### 1. Tarif Bleu (Réglementé)
- **Base** : Prix unique toute la journée
- **Heures Creuses** : 2 tarifs (HC/HP)
- **Tempo** : 6 tarifs (Bleu/Blanc/Rouge × HC/HP)
- **EJP** : Tarif historique (fermé aux nouveaux clients)

### 2. Offres de Marché
- Vert Électrique
- Mes jours zen
- Digiwatt

## Structure des Données

### Format Attendu

```json
{
  "provider": "EDF",
  "offers": [
    {
      "name": "Tarif Bleu - Base",
      "type": "regulated",
      "description": "Tarif réglementé option base",
      "prices": {
        "base": {
          "subscription_monthly": 12.44,
          "price_kwh": 0.2516
        }
      },
      "power_range": [3, 6, 9, 12, 15, 18],
      "updated_at": "2025-11-01T00:00:00Z"
    },
    {
      "name": "Tarif Bleu - Heures Creuses",
      "type": "regulated",
      "description": "Tarif réglementé option heures creuses",
      "prices": {
        "hp": {
          "subscription_monthly": 16.13,
          "price_kwh": 0.27
        },
        "hc": {
          "subscription_monthly": 16.13,
          "price_kwh": 0.2068
        }
      },
      "power_range": [6, 9, 12, 15, 18],
      "updated_at": "2025-11-01T00:00:00Z"
    }
  ]
}
```

## Méthode de Scraping

### Option 1 : Scraping HTML
- Parser la page avec BeautifulSoup4
- Extraire les tableaux de prix
- Identifier les puissances et options tarifaires

### Option 2 : API RTE (Données Publiques)
- Authentification via API Key
- Endpoint : `/open_api/tariff_blue/v1/`
- Format JSON structuré

## Notes Importantes

- Les tarifs réglementés sont fixés par la CRE (Commission de Régulation de l'Énergie)
- Mise à jour généralement au 1er février et au 1er août de chaque année
- Les prix incluent toutes taxes (TTC)
- Distinction entre abonnement mensuel et prix au kWh

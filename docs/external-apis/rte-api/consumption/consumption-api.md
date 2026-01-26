# RTE Consumption API - Documentation

## Vue d'Ensemble

L'API **Consumption** de RTE fournit les prévisions de consommation électrique pour la France métropolitaine.

**Version actuelle** : 1.2
**URL de base** : `https://digital.iservices.rte-france.com/open_api/consumption/v1/`

## Authentification

Même processus OAuth 2.0 que pour les autres APIs RTE. Voir [tempo-api.md](../tempo/tempo-api.md) pour les détails.

## Endpoints Disponibles

### 1. Short-term Forecasts (`/short_term`)

Prévisions à court terme incluant la consommation réalisée et les prédictions.

**Méthode** : GET

**Paramètres** :

| Paramètre    | Type     | Obligatoire | Description                              |
| ------------ | -------- | ----------- | ---------------------------------------- |
| `type`       | String   | Non         | Type de données : REALISED, ID, D-1, D-2 |
| `start_date` | ISO 8601 | Non         | Date de début                            |
| `end_date`   | ISO 8601 | Non         | Date de fin                              |

**Types de données** :

- `REALISED` : Consommation réalisée (temps réel)
- `ID` : Prévision intraday
- `D-1` : Prévision pour demain (disponible vers 19h30)
- `D-2` : Prévision pour après-demain (disponible vers 7h)

**Exemple de réponse** :

```json
{
  "short_term": [
    {
      "type": "D-1",
      "start_date": "2024-01-15T00:00:00+01:00",
      "end_date": "2024-01-16T00:00:00+01:00",
      "values": [
        {
          "start_date": "2024-01-15T00:00:00+01:00",
          "end_date": "2024-01-15T00:15:00+01:00",
          "value": 52000,
          "updated_date": "2024-01-14T19:30:00+01:00"
        }
      ]
    }
  ]
}
```

**Fréquence recommandée** :

- REALISED et ID : Toutes les 15 minutes
- D-1 : Une fois par jour vers 19h30
- D-2 : Une fois par jour vers 7h

### 2. Weekly Forecasts (`/weekly_forecasts`)

Prévisions hebdomadaires (J+3 à J+9).

**Méthode** : GET

**Paramètres** :

| Paramètre    | Type     | Obligatoire | Description   |
| ------------ | -------- | ----------- | ------------- |
| `start_date` | ISO 8601 | Non         | Date de début |
| `end_date`   | ISO 8601 | Non         | Date de fin   |

**Exemple de réponse** :

```json
{
  "weekly_forecasts": [
    {
      "start_date": "2024-01-18T00:00:00+01:00",
      "end_date": "2024-01-19T00:00:00+01:00",
      "peak_hour": 19,
      "peak_value": 65000,
      "temperature": 5.2,
      "values": [
        {
          "start_date": "2024-01-18T00:00:00+01:00",
          "end_date": "2024-01-18T00:30:00+01:00",
          "value": 48000
        }
      ]
    }
  ]
}
```

### 3. Annual Forecasts (`/annual_forecasts`)

Prévisions annuelles de consommation et marges prévisionnelles.

**Méthode** : GET

**Paramètres** :

| Paramètre    | Type     | Obligatoire | Description   |
| ------------ | -------- | ----------- | ------------- |
| `start_date` | ISO 8601 | Non         | Date de début |
| `end_date`   | ISO 8601 | Non         | Date de fin   |

## Utilisation dans MyElectricalData

L'API Consumption est utilisée pour :

1. **Prévisions Tempo** : La consommation prévue est utilisée pour calculer la consommation nette
2. **Calcul de la consommation nette** : `Consommation nette = Consommation - (Solaire + Éolien)`
3. **Normalisation** : La consommation nette est normalisée pour comparaison aux seuils RTE

### Formule de normalisation

```
Consommation nette normalisée = (Consommation nette - 46050) / 2160
```

Les constantes (46050 et 2160) sont calibrées par RTE à partir de données historiques.

## Exemple Python

```python
import httpx
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

async def get_consumption_forecast(token: str):
    paris_tz = ZoneInfo("Europe/Paris")
    now = datetime.now(paris_tz)

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://digital.iservices.rte-france.com/open_api/consumption/v1/short_term",
            params={
                "start_date": now.isoformat(),
                "end_date": (now + timedelta(days=2)).isoformat(),
            },
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
        )

        return response.json()
```

## Références

- [Portail RTE Services](https://www.services-rte.com/en/view-data-published-by-rte/consumption-forecast.html)
- [Catalogue API RTE](https://data.rte-france.com/catalog/-/api/consumption/Consumption/v1.2)

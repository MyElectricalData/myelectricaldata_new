# RTE Generation Forecast API - Documentation

## Vue d'Ensemble

L'API **Generation Forecast** de RTE fournit les prévisions de production électrique par filière (solaire, éolien, etc.) pour la France.

**Version actuelle** : 3.0
**URL de base** : `https://digital.iservices.rte-france.com/open_api/generation_forecast/v3/`

## Authentification

Même processus OAuth 2.0 que pour les autres APIs RTE. Voir [tempo-api.md](../tempo/tempo-api.md) pour les détails.

## Endpoint Principal

### Forecasts (`/forecasts`)

Prévisions de production par type d'énergie.

**Méthode** : GET

**Paramètres** :

| Paramètre         | Type     | Obligatoire | Description                                            |
| ----------------- | -------- | ----------- | ------------------------------------------------------ |
| `production_type` | String   | Oui (v3)    | Type de production : SOLAR, WIND_ONSHORE, WIND_OFFSHORE |
| `type`            | String   | Oui (v3)    | Type de prévision : D-3, D-2, D-1, ID                  |
| `start_date`      | ISO 8601 | Non         | Date de début                                          |
| `end_date`        | ISO 8601 | Non         | Date de fin                                            |

**Types de production** (v3) :

- `SOLAR` : Production solaire
- `WIND_ONSHORE` : Production éolienne terrestre
- `WIND_OFFSHORE` : Production éolienne en mer
- `AGGREGATED_PROGRAMMABLE_FRANCE` : Production pilotable France

> **Note v3** : L'API v3 sépare WIND en ONSHORE et OFFSHORE. Le paramètre `type` est maintenant **obligatoire**.

**Types de prévision** :

- `D-3` : Prévision à J-3
- `D-2` : Prévision à J-2
- `D-1` : Prévision à J-1 (référence, disponible vers 18h)
- `ID` : Prévision intraday (mise à jour chaque heure)
- `CURRENT` : Dernière prévision disponible

**Exemple de réponse** :

```json
{
  "forecasts": [
    {
      "production_type": "SOLAR",
      "type": "D-1",
      "start_date": "2024-01-15T00:00:00+01:00",
      "end_date": "2024-01-16T00:00:00+01:00",
      "values": [
        {
          "start_date": "2024-01-15T08:00:00+01:00",
          "end_date": "2024-01-15T08:30:00+01:00",
          "value": 1500,
          "updated_date": "2024-01-14T18:00:00+01:00"
        }
      ]
    }
  ]
}
```

## Horaires de publication

| Type de prévision | Disponibilité                         |
| ----------------- | ------------------------------------- |
| D-3               | 3 jours avant, vers 18h               |
| D-2               | 2 jours avant, vers 18h               |
| D-1               | Veille vers 18h (référence)           |
| ID                | Mise à jour intraday toutes les heures |

## Utilisation dans MyElectricalData

L'API Generation Forecast est utilisée pour calculer la **consommation nette** :

```
Consommation nette = Consommation prévue - Production solaire prévue - Production éolienne prévue
```

Cette consommation nette, une fois normalisée, est comparée aux seuils RTE pour estimer la probabilité des couleurs Tempo.

### Exemple Python

```python
import httpx
from datetime import datetime, date, timedelta, time
from zoneinfo import ZoneInfo

async def get_generation_forecast(token: str, prod_type: str = "SOLAR"):
    paris_tz = ZoneInfo("Europe/Paris")
    today = date.today()

    # Pour les données intraday (ID), utiliser aujourd'hui
    start_dt = datetime.combine(today, time(0, 0, 0)).replace(tzinfo=paris_tz)
    end_dt = datetime.combine(today + timedelta(days=1), time(0, 0, 0)).replace(tzinfo=paris_tz)

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://digital.iservices.rte-france.com/open_api/generation_forecast/v3/forecasts",
            params={
                "production_type": prod_type,  # SOLAR, WIND_ONSHORE, WIND_OFFSHORE
                "type": "ID",                  # Obligatoire en v3 : ID, D-1, D-2, D-3
                "start_date": start_dt.isoformat(),
                "end_date": end_dt.isoformat(),
            },
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
        )

        return response.json()
```

> **Important v3** : La période demandée doit correspondre au type de prévision.
> - `ID` : Données intraday pour aujourd'hui ou demain
> - `D-1` : Prévisions faites hier pour aujourd'hui (disponibles après 18h J-1)

## Limites

- **Période maximale** : Variable selon le type de donnée
- **Granularité** : 30 minutes généralement
- **Données futures** : Jusqu'à J+3 selon le type de prévision

## Références

- [Portail RTE Services - Generation Forecast](https://www.services-rte.com/en/view-data-published-by-rte/generation-forecast.html)
- [Catalogue API RTE v3](https://data.rte-france.com/catalog/-/api/generation/Generation-Forecast/v3.0)

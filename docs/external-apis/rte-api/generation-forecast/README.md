---
sidebar_position: 1
---

# API Generation Forecast (Prévisions de Production)

## Vue d'ensemble

L'API **Generation Forecast** de RTE fournit les prévisions de production électrique en France par filière (solaire, éolien, etc.).

**Endpoint** : `/open_api/generation_forecast/v3/forecasts`

---

## Caractéristiques

| Aspect | Valeur |
|--------|--------|
| **Version** | v3 (dernière version) |
| **Authentification** | OAuth2 Client Credentials (optionnel) |
| **Format** | JSON |
| **Granularité** | 30 minutes |
| **Horizon** | J+1 à J+3 |
| **Rate limiting** | Variable |

---

## Types de production

L'API v3 distingue plusieurs types de production :

| Type | Description | Disponibilité |
|------|-------------|---------------|
| **SOLAR** | Production solaire (photovoltaïque) | J+1 à J+3 |
| **WIND_ONSHORE** | Éolien terrestre | J+1 à J+3 |
| **WIND_OFFSHORE** | Éolien offshore (en mer) | J+1 à J+3 |

> **Note** : La v3 sépare l'éolien en ONSHORE et OFFSHORE (contrairement à la v2 qui avait un seul type WIND)

---

## Types de prévisions

| Type | Description | Horizon |
|------|-------------|---------|
| **D-1** | Prévision pour J+1 (lendemain) | J+1 uniquement |
| **D-2** | Prévision pour J+2 | J+2 uniquement |
| **D-3** | Prévision pour J+3 | J+3 uniquement |

**Important** : Contrairement à l'API Consumption, chaque type de prévision correspond à **un seul jour**.

---

## Format de requête

### Endpoint

```
GET https://digital.iservices.rte-france.com/open_api/generation_forecast/v3/forecasts
```

### Paramètres

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `start_date` | datetime ISO 8601 | ✅ | Date de début (timezone Paris) |
| `end_date` | datetime ISO 8601 | ✅ | Date de fin (timezone Paris) |
| `production_type` | string | ✅ | Type de production (SOLAR, WIND_ONSHORE, WIND_OFFSHORE) |
| `type` | string | ✅ | Type de prévision (D-1, D-2, D-3) |

### Contraintes v3

⚠️ **Contraintes strictes** de l'API v3 :

1. **Le type de prévision est obligatoire** (`D-1`, `D-2` ou `D-3`)
2. **La période doit correspondre exactement au type** :
   - `D-1` : demain uniquement (minuit à minuit)
   - `D-2` : après-demain uniquement
   - `D-3` : J+3 uniquement

### Exemple

```bash
# Prévisions solaires pour demain (D-1)
curl -X GET \
  'https://digital.iservices.rte-france.com/open_api/generation_forecast/v3/forecasts?start_date=2024-01-26T00:00:00+01:00&end_date=2024-01-26T23:59:59+01:00&production_type=SOLAR&type=D-1' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

## Format de réponse

### Structure JSON

```json
{
  "forecasts": [
    {
      "production_type": "SOLAR",
      "type": "D-1",
      "values": [
        {
          "start_date": "2024-01-26T00:00:00+01:00",
          "end_date": "2024-01-26T00:30:00+01:00",
          "updated_date": "2024-01-25T18:00:00+01:00",
          "value": 450
        },
        {
          "start_date": "2024-01-26T00:30:00+01:00",
          "end_date": "2024-01-26T01:00:00+01:00",
          "updated_date": "2024-01-25T18:00:00+01:00",
          "value": 425
        }
      ]
    }
  ]
}
```

### Champs

| Champ | Type | Description |
|-------|------|-------------|
| `production_type` | string | Type de production (SOLAR, WIND_ONSHORE, WIND_OFFSHORE) |
| `type` | string | Type de prévision (D-1, D-2, D-3) |
| `start_date` | datetime | Début de la période (30 min) |
| `end_date` | datetime | Fin de la période |
| `updated_date` | datetime | Date de mise à jour de la prévision |
| `value` | number | Production prévue en **MW** (mégawatts) |

---

## Utilisation dans MyElectricalData

### Page France

La page **France** affiche les prévisions de production par filière.

```
┌─────────────────────────────────────────────────────────────┐
│               Prévisions de Production                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☀️ Solaire (SOLAR)                                         │
│  [Graphique courbe prévision J+1]                           │
│                                                             │
│  🌬️ Éolien Terrestre (WIND_ONSHORE)                        │
│  [Graphique courbe prévision J+1]                           │
│                                                             │
│  🌊 Éolien Offshore (WIND_OFFSHORE)                         │
│  [Graphique courbe prévision J+1]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Backend

```python
# apps/api/src/services/rte.py

async def fetch_generation_forecast(
    self,
    production_type: str,  # SOLAR, WIND_ONSHORE, WIND_OFFSHORE
    forecast_type: str,    # D-1, D-2, D-3
    start_date: datetime,
    end_date: datetime,
) -> dict[str, Any]:
    """
    Fetch generation forecast from RTE API (v3)

    Important: v3 requires exact date range for forecast type:
    - D-1: tomorrow only (midnight to midnight)
    - D-2: day after tomorrow only
    - D-3: J+3 only

    Args:
        production_type: Production type (SOLAR, WIND_ONSHORE, WIND_OFFSHORE)
        forecast_type: Forecast type (D-1, D-2, D-3)
        start_date: Start datetime (must match forecast type)
        end_date: End datetime (must match forecast type)

    Returns:
        API response with forecast data
    """
```

### Cache en base de données

Les données sont stockées dans la table `generation_forecast` :

```python
class GenerationForecast(Base):
    """Generation forecast data from RTE (API v3)"""

    id = Column(UUID, primary_key=True)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    production_type = Column(String, nullable=False)  # SOLAR, WIND_ONSHORE, WIND_OFFSHORE
    type = Column(String, nullable=False)  # D-1, D-2, D-3
    value = Column(Float, nullable=False)  # MW
    updated_date = Column(DateTime)
```

### Mise à jour automatique

Un job planifié met à jour les prévisions toutes les heures :

```python
# Mise à jour prévisions de production
scheduler.add_job(
    rte_service.update_generation_forecast_cache,
    trigger=IntervalTrigger(hours=1),
)
```

Le service récupère automatiquement les 3 types de production pour D-1, D-2 et D-3 :

```python
async def update_generation_forecast_cache(
    self,
    db: AsyncSession,
    production_type: str | None = None,
) -> int:
    """
    Update French generation forecast cache (API v3)

    Fetches forecasts for:
    - Production types: SOLAR, WIND_ONSHORE, WIND_OFFSHORE
    - Forecast types: D-1, D-2, D-3
    """
    prod_types = (
        [production_type]
        if production_type
        else ["SOLAR", "WIND_ONSHORE", "WIND_OFFSHORE"]
    )

    for fc_type in ["D-1", "D-2", "D-3"]:
        for prod_type in prod_types:
            # Fetch and store forecast
            ...
```

---

## Cas d'usage

### 1. Prévisions solaires J+1

```python
# Récupérer les prévisions solaires pour demain
tomorrow = date.today() + timedelta(days=1)
start = datetime.combine(tomorrow, time(0, 0))
end = datetime.combine(tomorrow, time(23, 59))

forecast = await rte_service.fetch_generation_forecast(
    production_type="SOLAR",
    forecast_type="D-1",
    start_date=start,
    end_date=end
)
```

### 2. Toutes les prévisions J+1

```python
# Récupérer toutes les filières pour demain
for prod_type in ["SOLAR", "WIND_ONSHORE", "WIND_OFFSHORE"]:
    forecast = await rte_service.fetch_generation_forecast(
        production_type=prod_type,
        forecast_type="D-1",
        start_date=tomorrow_start,
        end_date=tomorrow_end
    )
```

### 3. Prévisions à 3 jours

```python
# Récupérer les prévisions solaires J+1, J+2, J+3
for fc_type, day_offset in [("D-1", 1), ("D-2", 2), ("D-3", 3)]:
    target_day = date.today() + timedelta(days=day_offset)
    start = datetime.combine(target_day, time(0, 0))
    end = datetime.combine(target_day, time(23, 59))

    forecast = await rte_service.fetch_generation_forecast(
        production_type="SOLAR",
        forecast_type=fc_type,
        start_date=start,
        end_date=end
    )
```

---

## Migration v2 → v3

### Changements majeurs

| Aspect | v2 | v3 |
|--------|----|----|
| **Type de prévision** | Optionnel | **Obligatoire** |
| **Période** | Flexible (J-1 à J+6) | **Stricte** (1 jour par type) |
| **Éolien** | `WIND` unique | `WIND_ONSHORE` + `WIND_OFFSHORE` |

### Exemple de migration

```python
# ❌ v2 (ne fonctionne plus)
forecast = await fetch_generation_forecast(
    production_type="WIND",  # WIND n'existe plus
    start_date=today,
    end_date=today + timedelta(days=3)  # Période multi-jours non supportée
)

# ✅ v3 (correct)
for fc_type, offset in [("D-1", 1), ("D-2", 2), ("D-3", 3)]:
    target = today + timedelta(days=offset)
    start = datetime.combine(target, time(0, 0))
    end = datetime.combine(target, time(23, 59))

    for wind_type in ["WIND_ONSHORE", "WIND_OFFSHORE"]:
        forecast = await fetch_generation_forecast(
            production_type=wind_type,
            forecast_type=fc_type,
            start_date=start,
            end_date=end
        )
```

---

## Codes d'erreur

| Code | Description | Solution |
|------|-------------|----------|
| **400** | Paramètres invalides ou période ne correspond pas au type | Vérifier `type` et dates |
| **401** | Token invalide ou expiré | Régénérer le token OAuth2 |
| **404** | Données non disponibles pour cette période | Normal si données pas encore publiées |
| **429** | Rate limit atteint | Attendre avant nouvelle requête |
| **500** | Erreur serveur RTE | Réessayer plus tard |

---

## Limites

### Horizon de prévision

- **Minimum** : J+1 (D-1)
- **Maximum** : J+3 (D-3)
- **Pas d'historique** : Données passées non disponibles

### Publication des prévisions

Les prévisions sont publiées selon un calendrier spécifique :
- **D-1** : Publié la veille vers 18h
- **D-2** : Publié 2 jours avant
- **D-3** : Publié 3 jours avant

### Données manquantes

Certaines périodes peuvent avoir des valeurs null :
- Prévision pas encore publiée
- Maintenance système
- Éolien offshore pas encore opérationnel dans certaines régions

---

## Exemple d'intégration

### Frontend (React)

```typescript
// apps/web/src/api/generation-forecast.ts

export interface GenerationForecast {
  start_date: string;
  end_date: string;
  production_type: 'SOLAR' | 'WIND_ONSHORE' | 'WIND_OFFSHORE';
  type: 'D-1' | 'D-2' | 'D-3';
  value: number;
}

export const getGenerationForecast = async (
  productionType?: string
): Promise<GenerationForecast[]> => {
  const { data } = await apiClient.get('/generation-forecast', {
    params: { production_type: productionType }
  });
  return data;
};
```

### Affichage

```tsx
// apps/web/src/pages/France.tsx

const FranceProduction = () => {
  const { data: solar } = useQuery({
    queryKey: ['generation-forecast', 'SOLAR'],
    queryFn: () => getGenerationForecast('SOLAR')
  });

  const { data: windOnshore } = useQuery({
    queryKey: ['generation-forecast', 'WIND_ONSHORE'],
    queryFn: () => getGenerationForecast('WIND_ONSHORE')
  });

  return (
    <div>
      <h2>Prévisions de Production</h2>
      <ProductionChart title="☀️ Solaire" data={solar} />
      <ProductionChart title="🌬️ Éolien Terrestre" data={windOnshore} />
    </div>
  );
};
```

---

## Ressources officielles

| Ressource | Lien |
|-----------|------|
| **Documentation RTE** | [RTE Data Portal](https://data.rte-france.com) |
| **API Sandbox** | [Swagger Generation Forecast](https://data.rte-france.com/catalog/-/api/generation/Forecast/v3.0) |
| **Guide migration v2→v3** | [RTE Support](https://data.rte-france.com/faq) |
| **Support** | support@rte-france.com |

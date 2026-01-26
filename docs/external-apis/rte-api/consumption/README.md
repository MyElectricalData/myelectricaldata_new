---
sidebar_position: 1
---

# API Consumption (Consommation France)

## Vue d'ensemble

L'API **Consumption** de RTE fournit les données de consommation électrique à l'échelle nationale française.

**Endpoint** : `/open_api/consumption/v1/short_term`

---

## Caractéristiques

| Aspect | Valeur |
|--------|--------|
| **Version** | v1 |
| **Authentification** | OAuth2 Client Credentials (optionnel) |
| **Format** | JSON |
| **Granularité** | 30 minutes |
| **Horizon** | J-2 à J+2 |
| **Rate limiting** | Variable |

---

## Types de données

L'API propose plusieurs types de consommation :

| Type | Description | Disponibilité |
|------|-------------|---------------|
| **REALISED** | Consommation réalisée (temps réel) | J-2 à J (actuel) |
| **ID** | Consommation infraday (estimation jour même) | J (actuel) |
| **D-1** | Prévision J+1 | J+1 |
| **D-2** | Prévision J+2 | J+2 |

---

## Format de requête

### Endpoint

```
GET https://digital.iservices.rte-france.com/open_api/consumption/v1/short_term
```

### Paramètres

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `start_date` | datetime ISO 8601 | ✅ | Date de début (timezone Paris) |
| `end_date` | datetime ISO 8601 | ✅ | Date de fin (timezone Paris) |
| `type` | string | ❌ | Type de consommation (REALISED, ID, D-1, D-2) |

### Exemple

```bash
curl -X GET \
  'https://digital.iservices.rte-france.com/open_api/consumption/v1/short_term?start_date=2024-01-25T00:00:00+01:00&end_date=2024-01-26T23:59:59+01:00&type=REALISED' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

## Format de réponse

### Structure JSON

```json
{
  "short_term": [
    {
      "start_date": "2024-01-25T00:00:00+01:00",
      "end_date": "2024-01-25T00:30:00+01:00",
      "updated_date": "2024-01-25T00:15:00+01:00",
      "type": "REALISED",
      "values": [
        {
          "start_date": "2024-01-25T00:00:00+01:00",
          "end_date": "2024-01-25T00:30:00+01:00",
          "updated_date": "2024-01-25T00:15:00+01:00",
          "value": 68500
        }
      ]
    }
  ]
}
```

### Champs

| Champ | Type | Description |
|-------|------|-------------|
| `start_date` | datetime | Début de la période |
| `end_date` | datetime | Fin de la période |
| `updated_date` | datetime | Date de mise à jour de la donnée |
| `type` | string | Type de consommation (REALISED, ID, D-1, D-2) |
| `value` | number | Consommation en **MW** (mégawatts) |

---

## Utilisation dans MyElectricalData

### Page France

La page **France** (`/france`) affiche la consommation nationale en temps réel et les prévisions.

```
┌─────────────────────────────────────────────────────────────┐
│                    Consommation France                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Temps réel (REALISED)                                      │
│  ━━━━━━━━━━━━━━━━━━━━                                       │
│  68 500 MW                                                  │
│                                                             │
│  Prévisions J+1 (D-1)                                       │
│  ━━━━━━━━━━━━━━━━━━━━                                       │
│  [Graphique courbe de charge]                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Backend

```python
# apps/api/src/services/rte.py

async def fetch_consumption_france(
    self,
    consumption_type: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    """
    Fetch French national consumption from RTE API

    Args:
        consumption_type: Optional type (REALISED, ID, D-1, D-2)
        start_date: Start datetime (Paris timezone)
        end_date: End datetime (Paris timezone)

    Returns:
        API response with consumption data
    """
```

### Cache en base de données

Les données sont stockées dans la table `consumption_france` :

```python
class ConsumptionFrance(Base):
    """French national consumption data from RTE"""

    id = Column(UUID, primary_key=True)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    type = Column(String, nullable=False)  # REALISED, ID, D-1, D-2
    value = Column(Float, nullable=False)  # MW
    updated_date = Column(DateTime)
```

### Mise à jour automatique

Un job planifié met à jour les données toutes les 30 minutes :

```python
# Mise à jour consommation France
scheduler.add_job(
    rte_service.update_consumption_france_cache,
    trigger=IntervalTrigger(minutes=30),
)
```

---

## Cas d'usage

### 1. Afficher la consommation actuelle

```python
# Récupérer la consommation temps réel
consumption = await rte_service.fetch_consumption_france(
    consumption_type="REALISED",
    start_date=now - timedelta(hours=1),
    end_date=now
)
```

### 2. Prévisions J+1

```python
# Récupérer les prévisions pour demain
forecasts = await rte_service.fetch_consumption_france(
    consumption_type="D-1",
    start_date=tomorrow_start,
    end_date=tomorrow_end
)
```

### 3. Historique

```python
# Récupérer l'historique sur 2 jours
history = await rte_service.fetch_consumption_france(
    consumption_type="REALISED",
    start_date=now - timedelta(days=2),
    end_date=now
)
```

---

## Codes d'erreur

| Code | Description | Solution |
|------|-------------|----------|
| **401** | Token invalide ou expiré | Régénérer le token OAuth2 |
| **400** | Paramètres invalides | Vérifier format dates et type |
| **404** | Données non disponibles | Période hors limites (J-2 à J+2) |
| **429** | Rate limit atteint | Attendre avant nouvelle requête |
| **500** | Erreur serveur RTE | Réessayer plus tard |

---

## Limites

### Période disponible

- **Historique** : J-2 maximum
- **Prévisions** : J+2 maximum
- **Granularité** : 30 minutes fixe

### Données manquantes

Certaines périodes peuvent avoir des valeurs manquantes (null) :
- Maintenance système
- Problème de collecte
- Période non encore atteinte

---

## Exemple d'intégration

### Frontend (React)

```typescript
// apps/web/src/api/consumption-france.ts

export const getConsumptionFrance = async (
  type?: 'REALISED' | 'ID' | 'D-1' | 'D-2'
): Promise<ConsumptionData[]> => {
  const { data } = await apiClient.get('/consumption-france', {
    params: { type }
  });
  return data;
};
```

### Affichage

```tsx
// apps/web/src/pages/France.tsx

const France = () => {
  const { data: consumption } = useQuery({
    queryKey: ['consumption-france', 'REALISED'],
    queryFn: () => getConsumptionFrance('REALISED')
  });

  return (
    <div>
      <h1>Consommation France</h1>
      <ConsumptionChart data={consumption} />
    </div>
  );
};
```

---

## Ressources officielles

| Ressource | Lien |
|-----------|------|
| **Documentation RTE** | [RTE Data Portal](https://data.rte-france.com) |
| **API Sandbox** | [Swagger Consumption](https://data.rte-france.com/catalog/-/api/consumption/v1.1) |
| **Support** | support@rte-france.com |

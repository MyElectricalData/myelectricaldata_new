# Exemple d'Intégration RTE Tempo API

Ce document fournit un exemple complet d'intégration de l'API RTE Tempo dans une application web.

## Architecture de l'Intégration

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
└────────┬────────┘
         │
         │ HTTP Request
         │
┌────────▼────────┐
│   Backend       │
│   (FastAPI)     │
└────────┬────────┘
         │
         │ OAuth 2.0
         │
┌────────▼────────┐
│   RTE Tempo     │
│   API           │
└─────────────────┘
```

## Backend - Service RTE Tempo (Python/FastAPI)

### 1. Configuration

```python
# apps/api/src/config/rte_config.py
from pydantic_settings import BaseSettings

class RTESettings(BaseSettings):
    """Configuration pour l'API RTE Tempo"""

    RTE_CLIENT_ID: str
    RTE_CLIENT_SECRET: str
    RTE_BASE_URL: str = "https://digital.iservices.rte-france.com"
    RTE_TOKEN_URL: str = "https://digital.iservices.rte-france.com/token/oauth/"
    RTE_API_VERSION: str = "v1"
    RTE_CACHE_TTL: int = 3600  # 1 heure en secondes

    class Config:
        env_file = ".env"

rte_settings = RTESettings()
```

### 2. Client RTE Tempo

```python
# apps/api/src/adapters/rte_tempo_client.py
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import httpx
from loguru import logger

class RTETempoClient:
    """Client pour l'API RTE Tempo"""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        base_url: str,
        token_url: str
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = base_url
        self.token_url = token_url
        self.access_token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None

    async def _get_access_token(self) -> str:
        """Obtenir ou renouveler le token OAuth"""

        if self.access_token and self.token_expiry:
            if self.token_expiry > datetime.now() + timedelta(minutes=5):
                return self.access_token

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret
                }
            )

            response.raise_for_status()
            data = response.json()

            self.access_token = data["access_token"]
            self.token_expiry = datetime.now() + timedelta(seconds=data["expires_in"])

            logger.info("RTE Tempo token obtained successfully")
            return self.access_token

    async def get_today_color(self) -> Optional[str]:
        """
        Récupérer la couleur Tempo du jour

        Returns:
            str: 'BLUE', 'WHITE', ou 'RED'
        """
        token = await self._get_access_token()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/open_api/tempo_like_supply_contract/{rte_settings.RTE_API_VERSION}/tempo_like_calendars",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json"
                },
                timeout=30.0
            )

            response.raise_for_status()
            data = response.json()

            if data.get("tempo_like_calendars"):
                calendars = data["tempo_like_calendars"]
                if calendars and calendars[0].get("values"):
                    color = calendars[0]["values"][0]["value"]
                    logger.info(f"Today's Tempo color: {color}")
                    return color

            return None

    async def get_tempo_calendar(
        self,
        start_date: datetime,
        end_date: datetime,
        include_fallback: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Récupérer le calendrier Tempo pour une période

        Args:
            start_date: Date de début
            end_date: Date de fin (max 366 jours après start_date)
            include_fallback: Inclure les informations de mode dégradé

        Returns:
            List[Dict]: Liste des calendriers Tempo
        """
        # Vérification de la période (max 366 jours)
        if (end_date - start_date).days > 366:
            raise ValueError("La période ne peut pas dépasser 366 jours")

        token = await self._get_access_token()

        params = {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        }

        if include_fallback:
            params["fallback_status"] = "true"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/open_api/tempo_like_supply_contract/{rte_settings.RTE_API_VERSION}/tempo_like_calendars",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json"
                },
                params=params,
                timeout=30.0
            )

            response.raise_for_status()
            data = response.json()

            calendars = data.get("tempo_like_calendars", [])
            logger.info(f"Retrieved {len(calendars)} Tempo calendar entries")

            return calendars

    async def get_tomorrow_color(self) -> Optional[str]:
        """
        Récupérer la couleur Tempo de demain (disponible après 10h40)

        Returns:
            str: 'BLUE', 'WHITE', ou 'RED', ou None si pas encore disponible
        """
        tomorrow = datetime.now() + timedelta(days=1)
        start = tomorrow.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)

        try:
            calendars = await self.get_tempo_calendar(start, end)
            if calendars and calendars[0].get("values"):
                return calendars[0]["values"][0]["value"]
        except Exception as e:
            logger.warning(f"Could not retrieve tomorrow's color: {e}")

        return None


# Singleton
_rte_client: Optional[RTETempoClient] = None

def get_rte_tempo_client() -> RTETempoClient:
    """Factory pour le client RTE Tempo"""
    global _rte_client

    if _rte_client is None:
        _rte_client = RTETempoClient(
            client_id=rte_settings.RTE_CLIENT_ID,
            client_secret=rte_settings.RTE_CLIENT_SECRET,
            base_url=rte_settings.RTE_BASE_URL,
            token_url=rte_settings.RTE_TOKEN_URL
        )

    return _rte_client
```

### 3. Service de Cache

```python
# apps/api/src/services/tempo_cache.py
from datetime import datetime, date
from typing import Optional
import json
from redis import Redis
from loguru import logger

class TempoCacheService:
    """Service de cache pour les données Tempo"""

    def __init__(self, redis_client: Redis, ttl: int = 3600):
        self.redis = redis_client
        self.ttl = ttl
        self.key_prefix = "tempo"

    def _get_key(self, key_type: str, date_str: str = None) -> str:
        """Générer une clé Redis"""
        if date_str:
            return f"{self.key_prefix}:{key_type}:{date_str}"
        return f"{self.key_prefix}:{key_type}"

    def get_today_color(self) -> Optional[str]:
        """Récupérer la couleur du jour depuis le cache"""
        key = self._get_key("today")
        cached = self.redis.get(key)

        if cached:
            logger.debug("Tempo today color retrieved from cache")
            return cached.decode("utf-8")

        return None

    def set_today_color(self, color: str) -> None:
        """Stocker la couleur du jour dans le cache"""
        key = self._get_key("today")
        self.redis.setex(key, self.ttl, color)
        logger.debug(f"Tempo today color cached: {color}")

    def get_calendar_day(self, date_obj: date) -> Optional[str]:
        """Récupérer la couleur d'un jour spécifique"""
        date_str = date_obj.isoformat()
        key = self._get_key("calendar", date_str)
        cached = self.redis.get(key)

        if cached:
            return cached.decode("utf-8")

        return None

    def set_calendar_day(self, date_obj: date, color: str) -> None:
        """Stocker la couleur d'un jour spécifique"""
        date_str = date_obj.isoformat()
        key = self._get_key("calendar", date_str)
        # Les couleurs historiques ne changent jamais, TTL long (7 jours)
        self.redis.setex(key, 7 * 24 * 3600, color)

    def get_calendar_period(
        self,
        start_date: date,
        end_date: date
    ) -> Optional[dict]:
        """Récupérer un calendrier pour une période"""
        key = self._get_key(
            "period",
            f"{start_date.isoformat()}_{end_date.isoformat()}"
        )
        cached = self.redis.get(key)

        if cached:
            return json.loads(cached)

        return None

    def set_calendar_period(
        self,
        start_date: date,
        end_date: date,
        data: dict
    ) -> None:
        """Stocker un calendrier pour une période"""
        key = self._get_key(
            "period",
            f"{start_date.isoformat()}_{end_date.isoformat()}"
        )
        self.redis.setex(key, self.ttl, json.dumps(data))
```

### 4. Router FastAPI

```python
# apps/api/src/routers/tempo.py
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..adapters.rte_tempo_client import get_rte_tempo_client, RTETempoClient
from ..services.tempo_cache import TempoCacheService
from ..services.redis_service import get_redis_client

router = APIRouter(prefix="/tempo", tags=["Tempo"])


class TempoColorResponse(BaseModel):
    """Réponse pour la couleur Tempo"""
    date: str
    color: str = Field(..., pattern="^(BLUE|WHITE|RED)$")
    updated_at: Optional[str] = None


class TempoCalendarDay(BaseModel):
    """Jour du calendrier Tempo"""
    start_date: str
    end_date: str
    color: str = Field(..., pattern="^(BLUE|WHITE|RED)$")
    updated_date: Optional[str] = None


class TempoCalendarResponse(BaseModel):
    """Réponse calendrier Tempo"""
    calendars: List[TempoCalendarDay]


@router.get("/today", response_model=TempoColorResponse)
async def get_today_tempo_color(
    rte_client: RTETempoClient = Depends(get_rte_tempo_client)
):
    """
    Récupérer la couleur Tempo du jour actuel

    Retourne:
    - date: Date du jour au format ISO
    - color: Couleur Tempo (BLUE, WHITE, RED)
    - updated_at: Date de dernière mise à jour
    """
    # Vérifier le cache
    cache = TempoCacheService(get_redis_client())
    cached_color = cache.get_today_color()

    if cached_color:
        return TempoColorResponse(
            date=date.today().isoformat(),
            color=cached_color
        )

    # Appeler l'API RTE
    try:
        color = await rte_client.get_today_color()

        if not color:
            raise HTTPException(
                status_code=404,
                detail="Couleur Tempo non disponible"
            )

        # Mettre en cache
        cache.set_today_color(color)

        return TempoColorResponse(
            date=date.today().isoformat(),
            color=color
        )

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de la récupération des données Tempo: {str(e)}"
        )


@router.get("/tomorrow", response_model=TempoColorResponse)
async def get_tomorrow_tempo_color(
    rte_client: RTETempoClient = Depends(get_rte_tempo_client)
):
    """
    Récupérer la couleur Tempo de demain

    Note: Disponible après 10h40 chaque jour
    """
    try:
        color = await rte_client.get_tomorrow_color()

        if not color:
            raise HTTPException(
                status_code=404,
                detail="Couleur de demain pas encore disponible (disponible après 10h40)"
            )

        tomorrow = date.today() + timedelta(days=1)

        return TempoColorResponse(
            date=tomorrow.isoformat(),
            color=color
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de la récupération des données Tempo: {str(e)}"
        )


@router.get("/calendar", response_model=TempoCalendarResponse)
async def get_tempo_calendar(
    start_date: str = Query(..., description="Date de début (ISO 8601)"),
    end_date: str = Query(..., description="Date de fin (ISO 8601)"),
    rte_client: RTETempoClient = Depends(get_rte_tempo_client)
):
    """
    Récupérer le calendrier Tempo pour une période

    Limites:
    - Période maximale: 366 jours
    - Date future maximale: J+2
    """
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Format de date invalide. Utilisez le format ISO 8601"
        )

    # Vérifier le cache
    cache = TempoCacheService(get_redis_client())
    cached_data = cache.get_calendar_period(start.date(), end.date())

    if cached_data:
        return TempoCalendarResponse(calendars=cached_data)

    try:
        calendars = await rte_client.get_tempo_calendar(start, end)

        # Convertir au format de réponse
        response_data = []
        for calendar in calendars:
            for value in calendar.get("values", []):
                response_data.append(
                    TempoCalendarDay(
                        start_date=value["start_date"],
                        end_date=value["end_date"],
                        color=value["value"],
                        updated_date=value.get("updated_date")
                    )
                )

                # Mettre en cache chaque jour individuellement
                day_date = datetime.fromisoformat(value["start_date"]).date()
                cache.set_calendar_day(day_date, value["value"])

        # Mettre en cache la période complète
        cache.set_calendar_period(start.date(), end.date(), response_data)

        return TempoCalendarResponse(calendars=response_data)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de la récupération du calendrier Tempo: {str(e)}"
        )
```

## Frontend - Composants React

### 1. Hook pour les données Tempo

```typescript
// apps/web/src/hooks/useTempo.ts
import { useState, useEffect } from 'react';
import { tempoApi } from '../api/tempo';

export type TempoColor = 'BLUE' | 'WHITE' | 'RED';

interface TempoColorData {
  date: string;
  color: TempoColor;
  updated_at?: string;
}

export const useTempo = () => {
  const [todayColor, setTodayColor] = useState<TempoColorData | null>(null);
  const [tomorrowColor, setTomorrowColor] = useState<TempoColorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTempoData();
  }, []);

  const fetchTempoData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [today, tomorrow] = await Promise.allSettled([
        tempoApi.getTodayColor(),
        tempoApi.getTomorrowColor()
      ]);

      if (today.status === 'fulfilled') {
        setTodayColor(today.value);
      }

      if (tomorrow.status === 'fulfilled') {
        setTomorrowColor(tomorrow.value);
      } else {
        // Demain pas encore disponible (normal avant 10h40)
        setTomorrowColor(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return {
    todayColor,
    tomorrowColor,
    loading,
    error,
    refresh: fetchTempoData
  };
};
```

### 2. Composant d'affichage de la couleur

```typescript
// apps/web/src/components/TempoIndicator.tsx
import React from 'react';
import { Zap } from 'lucide-react';
import { TempoColor } from '../hooks/useTempo';

interface TempoIndicatorProps {
  color: TempoColor;
  date?: string;
  showLabel?: boolean;
}

const TEMPO_CONFIG = {
  BLUE: {
    label: 'Jour Bleu',
    description: 'Tarif avantageux',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-800 dark:text-blue-200',
    borderClass: 'border-blue-300 dark:border-blue-700',
    iconClass: 'text-blue-600 dark:text-blue-400'
  },
  WHITE: {
    label: 'Jour Blanc',
    description: 'Tarif intermédiaire',
    bgClass: 'bg-gray-100 dark:bg-gray-800',
    textClass: 'text-gray-800 dark:text-gray-200',
    borderClass: 'border-gray-300 dark:border-gray-600',
    iconClass: 'text-gray-600 dark:text-gray-400'
  },
  RED: {
    label: 'Jour Rouge',
    description: 'Tarif élevé',
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    textClass: 'text-red-800 dark:text-red-200',
    borderClass: 'border-red-300 dark:border-red-700',
    iconClass: 'text-red-600 dark:text-red-400'
  }
};

export const TempoIndicator: React.FC<TempoIndicatorProps> = ({
  color,
  date,
  showLabel = true
}) => {
  const config = TEMPO_CONFIG[color];

  return (
    <div
      className={`
        flex items-center gap-3 p-4 rounded-lg border-2
        ${config.bgClass} ${config.borderClass}
      `}
    >
      <Zap className={`${config.iconClass}`} size={24} />

      <div className="flex-1">
        {showLabel && (
          <div className={`font-semibold ${config.textClass}`}>
            {config.label}
          </div>
        )}
        <div className={`text-sm ${config.textClass} opacity-80`}>
          {config.description}
        </div>
        {date && (
          <div className={`text-xs ${config.textClass} opacity-60 mt-1`}>
            {new Date(date).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </div>
        )}
      </div>
    </div>
  );
};
```

### 3. Widget Tempo pour le Dashboard

```typescript
// apps/web/src/components/TempoWidget.tsx
import React from 'react';
import { Calendar, RefreshCw } from 'lucide-react';
import { useTempo } from '../hooks/useTempo';
import { TempoIndicator } from './TempoIndicator';

export const TempoWidget: React.FC = () => {
  const { todayColor, tomorrowColor, loading, error, refresh } = useTempo();

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4" />
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="text-red-600 dark:text-red-400">
          Erreur: {error}
        </div>
        <button
          onClick={refresh}
          className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Calendar className="text-primary-600 dark:text-primary-400" size={24} />
          Tempo RTE
        </h2>
        <button
          onClick={refresh}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          title="Actualiser"
        >
          <RefreshCw size={18} className="text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      <div className="space-y-4">
        {todayColor && (
          <div>
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Aujourd'hui
            </div>
            <TempoIndicator
              color={todayColor.color}
              date={todayColor.date}
              showLabel={true}
            />
          </div>
        )}

        {tomorrowColor && (
          <div>
            <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
              Demain
            </div>
            <TempoIndicator
              color={tomorrowColor.color}
              date={tomorrowColor.date}
              showLabel={true}
            />
          </div>
        )}

        {!tomorrowColor && todayColor && (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic">
            La couleur de demain sera disponible après 10h40
          </div>
        )}
      </div>
    </div>
  );
};
```

### 4. API Client

```typescript
// apps/web/src/api/tempo.ts
import { apiClient } from './client';

export interface TempoColorResponse {
  date: string;
  color: 'BLUE' | 'WHITE' | 'RED';
  updated_at?: string;
}

export interface TempoCalendarDay {
  start_date: string;
  end_date: string;
  color: 'BLUE' | 'WHITE' | 'RED';
  updated_date?: string;
}

export interface TempoCalendarResponse {
  calendars: TempoCalendarDay[];
}

export const tempoApi = {
  async getTodayColor(): Promise<TempoColorResponse> {
    const response = await apiClient.get('/tempo/today');
    return response.data;
  },

  async getTomorrowColor(): Promise<TempoColorResponse> {
    const response = await apiClient.get('/tempo/tomorrow');
    return response.data;
  },

  async getCalendar(
    startDate: string,
    endDate: string
  ): Promise<TempoCalendarResponse> {
    const response = await apiClient.get('/tempo/calendar', {
      params: { start_date: startDate, end_date: endDate }
    });
    return response.data;
  }
};
```

## Tests

### Backend - Tests Unitaires

```python
# apps/api/tests/test_tempo_client.py
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from src.adapters.rte_tempo_client import RTETempoClient


@pytest.mark.asyncio
async def test_get_today_color():
    """Test récupération couleur du jour"""
    client = RTETempoClient(
        client_id="test",
        client_secret="test",
        base_url="https://test.com",
        token_url="https://test.com/token"
    )

    mock_response = {
        "tempo_like_calendars": [
            {
                "values": [
                    {"value": "BLUE"}
                ]
            }
        ]
    }

    with patch.object(client, '_get_access_token', return_value="test_token"):
        with patch('httpx.AsyncClient.get') as mock_get:
            mock_get.return_value.json.return_value = mock_response
            mock_get.return_value.raise_for_status = lambda: None

            color = await client.get_today_color()
            assert color == "BLUE"


@pytest.mark.asyncio
async def test_get_tempo_calendar_period_validation():
    """Test validation de la période (max 366 jours)"""
    client = RTETempoClient(
        client_id="test",
        client_secret="test",
        base_url="https://test.com",
        token_url="https://test.com/token"
    )

    start = datetime.now()
    end = start + timedelta(days=367)

    with pytest.raises(ValueError, match="366 jours"):
        await client.get_tempo_calendar(start, end)
```

### Frontend - Tests React

```typescript
// apps/web/src/components/__tests__/TempoWidget.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { TempoWidget } from '../TempoWidget';
import { tempoApi } from '../../api/tempo';

jest.mock('../../api/tempo');

describe('TempoWidget', () => {
  it('affiche la couleur du jour', async () => {
    (tempoApi.getTodayColor as jest.Mock).mockResolvedValue({
      date: '2024-01-15',
      color: 'BLUE'
    });

    (tempoApi.getTomorrowColor as jest.Mock).mockRejectedValue(
      new Error('Not available')
    );

    render(<TempoWidget />);

    await waitFor(() => {
      expect(screen.getByText('Jour Bleu')).toBeInTheDocument();
      expect(screen.getByText('Tarif avantageux')).toBeInTheDocument();
    });
  });

  it('affiche un message si demain pas disponible', async () => {
    (tempoApi.getTodayColor as jest.Mock).mockResolvedValue({
      date: '2024-01-15',
      color: 'RED'
    });

    (tempoApi.getTomorrowColor as jest.Mock).mockRejectedValue(
      new Error('Not available')
    );

    render(<TempoWidget />);

    await waitFor(() => {
      expect(screen.getByText(/disponible après 10h40/)).toBeInTheDocument();
    });
  });
});
```

## Déploiement

### Variables d'Environnement

Ajouter dans `.env.api` :

```bash
RTE_CLIENT_ID=your_client_id_here
RTE_CLIENT_SECRET=your_client_secret_here
RTE_BASE_URL=https://digital.iservices.rte-france.com
RTE_CACHE_TTL=3600
```

### Enregistrement du Router

Dans `apps/api/src/main.py` :

```python
from .routers import tempo

app.include_router(tempo.router, prefix="/api")
```

## Conclusion

Cette intégration fournit :
- ✅ Cache Redis pour optimiser les appels API
- ✅ Gestion automatique des tokens OAuth
- ✅ Interface utilisateur réactive avec dark mode
- ✅ Gestion des erreurs et états de chargement
- ✅ Tests unitaires et d'intégration
- ✅ Type safety avec TypeScript et Pydantic
